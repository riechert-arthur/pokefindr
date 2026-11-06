# Background jobs

Async work runs on Vercel (decision: #86):

- **Scheduled work:** Vercel Cron calls `GET /api/jobs/<name>`.
- **Background and event-driven work:** `enqueueJob()` publishes to Vercel Queues, and `POST /api/queues/jobs` runs the job, with retries.
- **Local and CLI:** `npm run job -- <name>` runs the same code.

Every path goes through one registry and `runJob()`, so a job is written once and works from cron, the queue, and the CLI.

```
src/server/jobs/
  types.ts      Job, JobContext, JobResult
  registry.ts   name → job (the only list of jobs)
  run.ts        runJob(): runs by name, logs name/trigger/duration/outcome
  auth.ts       constant-time check of Authorization: Bearer <CRON_SECRET>
  enqueue.ts    enqueueJob(): Vercel Queues on Vercel, inline elsewhere
  consumer.ts   queue message handler and retry policy
src/app/api/jobs/[name]/route.ts   cron entry point (GET, or POST with a JSON payload)
src/app/api/queues/jobs/route.ts   Vercel Queues consumer for the `jobs` topic
vercel.json                        cron schedules and the queue trigger
scripts/run-job.ts                 npm run job
```

## Add a job

1. Write it, usually in `src/server/jobs/<name>.ts`:

   ```ts
   import type { Job } from "./types"

   export const expireEvents: Job = {
     description: "Deactivates events whose end date has passed",
     async run(_payload, ctx) {
       const count = await deactivateEndedEvents() // a service call
       return { deactivated: count }
     },
   }
   ```

2. Register it in `registry.ts` under a kebab-case name: `"expire-events": expireEvents`.
3. Run it locally: `npm run job -- expire-events`.

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

- Crons only run on the production deployment. Vercel sends `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is set in the project's environment variables.
- Without `CRON_SECRET`, `/api/jobs/*` rejects every request.
- Any other scheduler (GitHub Actions, another host's cron) can call `POST /api/jobs/<name>` with the same header, plus an optional JSON payload.

## Run a job in the background (Vercel Queues)

```ts
import { enqueueJob } from "@/server/jobs/enqueue"

await enqueueJob("notify-moderators", { submissionId }, { idempotencyKey: `submission-created:${submissionId}` })
```

- **On Vercel:** publishes `{ job, payload }` to the `jobs` topic. `/api/queues/jobs` runs it. A failure is retried with backoff (10 s, 20 s, 40 s…, capped at 10 min) and dropped after 8 deliveries. Every attempt is logged.
- **Off Vercel** (local dev, tests, another host): runs the job inline and waits for it.
- **Malformed messages and unknown jobs** are logged and acknowledged, not retried.
- **Sending isn't part of your database transaction.** If a write must always produce a job, store an outbox row in the same transaction, and have a cron job send anything left unsent.

Vercel Queues is in beta (`queue/v2beta`), and `@vercel/queue` is pinned to an exact version. Only `enqueue.ts` and the consumer route import it. To move off Vercel, replace those two; the jobs stay the same.

## Logs

Each run logs one line: `[jobs] ok { job, trigger, messageId, deliveryCount, ms }`. Failures log `[jobs] failed …` with the error, and the queue consumer adds `dropping invalid queue message` or `giving up on queue message`. Filter Vercel runtime logs on `[jobs]`.

## Costs

Queue operations cost $0.60 per million, and a message is about 3 operations (send, deliver, acknowledge). Hobby includes 1M operations. Job functions are billed at normal Fluid compute rates. Expected volume is thousands of messages a month.
