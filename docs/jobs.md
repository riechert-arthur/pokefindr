# Background jobs

Async work runs on Vercel (decision: #86):

- **Scheduled work:** Vercel Cron calls `GET /api/jobs/<name>`.
- **Background and event-driven work:** `enqueueJob()` publishes a signed message to Vercel Queues, and `POST /api/queues/jobs` runs the job, with retries.
- **Local and CLI:** `npm run job -- <name>` runs the same code.

Every path goes through one registry and `runJob()`, so a job is written once and works from cron, the queue, HTTP, and the CLI.

```
src/server/lib/jobs/
  types.ts      Job, defineJob(), JobContext, JobResult
  registry.ts   name → job (the only list of jobs)
  run.ts        runJob(): validates name + payload, runs, logs name/trigger/duration/outcome
  auth.ts       constant-time check of Authorization: Bearer <CRON_SECRET>
  signing.ts    HMAC signing of queue messages (key derived from CRON_SECRET)
  enqueue.ts    enqueueJob(): signed message to Vercel Queues on Vercel, background run elsewhere
  consumer.ts   queue message handler and retry policy
src/app/api/jobs/[name]/route.ts   cron and HTTP entry point (GET, or POST with a JSON payload)
src/app/api/queues/jobs/route.ts   Vercel Queues consumer for the `jobs` topic
vercel.json                        cron schedules and the queue trigger
scripts/run-job.ts                 npm run job
```

## Add a job

`src/server/lib/jobs/` is the machinery, not where jobs live. Put the work in a service (`src/server/services/`), and give the registry a thin job that calls it:

1. Define the job next to the service it calls, with a schema for its payload:

   ```ts
   import { z } from "zod"
   import { defineJob } from "@/server/lib/jobs/types"

   export const notifyModeratorsJob = defineJob({
     description: "Tells moderators about a new submission",
     schema: z.object({ submissionId: z.string().uuid() }),
     async run({ submissionId }) {
       return { notified: await notifyModerators(submissionId) }
     },
   })
   ```

   Payloads arrive as untrusted JSON (HTTP bodies, queue messages, the CLI). `runJob` checks them against `schema` before `run`; an invalid payload is a 400 over HTTP, and is dropped (not retried) on the queue. A job without a schema gets `unknown`.

2. Register it in `src/server/lib/jobs/registry.ts` under a kebab-case name: `"notify-moderators": notifyModeratorsJob`.
3. Run it locally: `npm run job -- notify-moderators '{"submissionId":"…"}'`.

Rules for every job:

- **Idempotent.** Queue delivery is at least once, and a cron run can overlap a retry. Use upserts and "already done" checks, keyed on ids.
- **Small payloads:** ids, not documents. Every 4 KiB of a queue message is billed as an operation.
- **Short runs.** Each run must finish within the function's max duration. Split long work into chunks, where each chunk enqueues the next (`enqueueJob(name, { cursor })`).
- **Don't rename a job** that is scheduled or may have messages in flight.

## Schedule a job (Vercel Cron)

Add an entry to `crons` in `vercel.json`:

```json
{ "path": "/api/jobs/expire-events", "schedule": "0 7 * * *" }
```

- Crons only run on the production deployment. Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set in the project's environment variables. Runs are logged with `trigger: "cron"` (identified by `user-agent: vercel-cron/…`).
- Without `CRON_SECRET`, `/api/jobs/*` rejects every request, and queue messages are dropped.
- Any other caller (GitHub Actions, a manual run, another host's cron) can call `POST /api/jobs/<name>` with the same header and an optional JSON payload. These runs are logged with `trigger: "http"`.

## Run a job in the background (Vercel Queues)

```ts
import { enqueueJob } from "@/server/lib/jobs/enqueue"

await enqueueJob("notify-moderators", { submissionId }, { idempotencyKey: `submission-created:${submissionId}` })
```

**On Vercel**, it publishes `{ v: 1, job, body, sig }` to the `jobs` topic, where `body` is the serialized payload and `sig` is an HMAC over `job` and `body`. `/api/queues/jobs` then:

- **drops** malformed messages, messages with a bad signature, and payloads that fail the job's schema. It logs `[jobs] dropping …` and doesn't retry.
- **retries** a message for a job name this deployment doesn't know. During a rollout, a newer deployment may send a job that an older one receives.
- **retries** a job that throws, with backoff (10 s, 20 s, 40 s…, capped at 10 minutes), and drops it after 8 deliveries.

`maxDeliveries` and `retryAfterSeconds` in `vercel.json` must equal `MAX_DELIVERIES` and `FIRST_RETRY_SECONDS` in `consumer.ts`, because Vercel applies its own values when the function crashes or times out. A test checks that they match.

**Off Vercel** (local dev, tests, another host), `enqueueJob` returns at once and runs the job in the same process: after `delaySeconds` if given, with no retries, and with failures logged rather than thrown. `idempotencyKey` is ignored. The result's `done` promise settles when the run finishes, which is useful in tests.

### Why messages are signed

`@vercel/queue`'s `handleCallback` takes the payload from the request body and checks only the format of the `ce-*` headers, not who sent them. Vercel is meant to keep functions with a queue trigger private, but if that protection were ever missing, anyone could run any job. The signature means the consumer runs only messages that `enqueueJob()` produced, on any host. The key is derived from `CRON_SECRET`. **Rotating `CRON_SECRET` invalidates messages already in the queue**, so rotate when the queue is idle.

### Things that strand messages

- **The consumer group is derived from the route's file path** (`src/app/api/queues/jobs/route.ts`). Moving or renaming that file creates a new group, and messages waiting for the old one are never delivered.
- Renaming a job, or rotating `CRON_SECRET`, while messages are in flight.

Vercel Queues is in beta (`queue/v2beta`), and `@vercel/queue` is pinned to an exact version. Only `enqueue.ts` and the consumer route import it. To move off Vercel, replace those two; the jobs stay the same.

## Logs

Each run logs one line: `[jobs] ok { job, trigger, messageId, deliveryCount, ms }`. Failures log `[jobs] failed …` with the error. The queue consumer also logs `dropping …`, `unknown job; retrying …` and `giving up on queue message`. Filter Vercel runtime logs on `[jobs]`.

## Costs

Queue operations cost $0.60 per million, and a message is about 3 operations (send, deliver, acknowledge). Hobby includes 1M operations. Job functions are billed at normal Fluid compute rates. Expected volume is thousands of messages a month.
