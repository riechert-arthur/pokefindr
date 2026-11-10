# Logging

Server code logs through `src/server/log.ts` (#254), never `console.*` directly. Each call writes one JSON object per line, which Vercel's runtime logs show and can search:

```json
{"level":"error","event":"db.write_failed","requestId":"iad1::abc-123","route":"/api/reviews","write":"review","errorName":"DrizzleQueryError","code":"23505","constraint":"location_ratings_pkey","table":"location_ratings","msg":"duplicate key value violates unique constraint \"…\"","db":true,"at":"…"}
```

## Using it

```ts
import { audit, log, timed } from "@/server/log"

// In a route: adds requestId (from x-vercel-id) and route to every line.
const l = log.forRequest(request, "/api/reviews")
l.info("something.happened", { count: 3 })
l.logError("db.write_failed", err, { write: "review" })

// Slow-query timing: logs db.slow { op, ms } past 500 ms.
const rows = await timed("getLocationsNear", () => db.execute(sql`…`))

// Admin and moderation trail.
audit(l, "submission.approve", { actorId: userId, target: id, outcome: "done" })
```

- **Levels:** `info` goes to `console.info`; `warn` and `error` go to `console.error`, since Vercel shows `console.warn` as an error anyway.
- **`logError(event, err, fields)`** writes what the error *is*: `errorName`, the Postgres `code`, `constraint`, `table`, `column`, an SMTP `responseCode`, the **first line** of the message (for a failed query, the driver's message, not the SQL), and the stack frame it came from (`at`). It never writes the error object, its query or its params. Drizzle's `DrizzleQueryError` message is `Failed query: … params: …`, so logging it raw prints whatever the query carried. The message line also loses everything in double quotes (`"…"`: values, and names too, which `constraint`, `table` and `column` keep), email addresses and URL query strings. An error whose `cause` is a failed query logs the cause by its driver's code, never its SQL. Fields you pass win over the error's, and no field can replace a line's `level` or `event`.
- **Sizes:** strings are cut at 1,000 characters and arrays at 50, and a line still over 16 KB keeps only its event, ids and code (Vercel's limit is 256 KB per line). One request writes at most 100 lines through `log.forRequest`, however many loggers it makes, then logs `log.capped` (Vercel keeps 256 lines per request). Still, build one logger per handler, so the route is written once.

## Never logged

The logger drops these keys at any depth, compared without case, `_` or `-`: `email`, `to`, `token`, `password`, `secret`, `authorization`, `cookie`, `set-cookie`, `lat`, `lng`, `lon`, `latitude`, `longitude`, `coordinates`, `center`, `near`, `query`, `q`, `params`, `text`, `comment`, `question`, `answer`, `address`, `ip`, and any key ending in `token`, `password`, `secret` or `email` (`accessToken`, `userEmail`; `inputTokens` is a count and stays).

Don't work around it with another key name. In short: no emails, usernames, full IPs, typed text (reviews, searches, assistant messages, geocoder input), addresses or coordinates. User ids are the internal UUID, which abuse investigations need, and are fine.

## Events

| Event | Level | Fields | Where |
|---|---|---|---|
| `api.failed` | error | `route`, `requestId`, `step`, error fields | any API route's catch |
| `db.write_failed` | error | `write` (`review`, `submission`, `status_report`, `assistant_feedback`, `assistant_history_delete`), `code`, `constraint` | the routes that write those |
| `db.slow` | warn | `op`, `ms` | `queryFeatures`, `searchLocations`, `getLocationsNear`, `countLocationsNear`, `getTopCities`, `getRegionCounts`, `rateLimit.take`, `recordTurn` past 500 ms |
| `page.failed` | error | `route`, `step` | the map and landing pages' soft failures |
| `admin.submission.approve` / `.reject` / `.undo` | info | `actorId`, `target` (submission id), `outcome` (`done`, `not_pending`, `own`, …) | `/api/admin/submissions/[id]` |
| `admin.reports.<action>` | info | `actorId`, `target` (location id), `outcome`, `reports` | `/api/admin/reports/[locationId]` |
| `admin.vending.add` / `.undo` | info | `actorId`, `target` (location id), `outcome` | `/api/admin/vending`, `/api/admin/vending/[id]` |
| `admin.ads.set` | info | `actorId`, `target` (placement), `outcome` (`enabled` / `disabled`) | `/api/admin/ads/[placement]` |
| `admin.job.run` / `.pause` / `.resume` | info | `actorId`, `target` (job), `outcome` (`queued`, `done`, `paused`, `not_runnable`) | `/api/admin/jobs/[name]` |
| `job.ok` / `job.failed` / `job.skipped` | info / error / info | `job`, `trigger`, `messageId`, `deliveryCount`, `ms`, `result` (the job's counts: rows touched) | `src/server/lib/jobs/run.ts` |
| `job.message_dropped` | error | `reason` (`malformed`, `bad_signature`, `unreadable_body`, `invalid_payload`), `job` | the queue consumer |
| `job.message_held`, `job.unknown`, `job.gave_up`, `job.record_failed`, `job.pause_check_failed` | various | `job`, `messageId` | the queue consumer and run history |
| `assistant_turn` | info | `turnId`, `userId`, `outcome`, `model`, token counts, `costMicros`, `latencyMs`, `tools`, `flags` | `recordTurn` (no message text) |
| `security.rate_limited` | info | `rule`, `ipPrefix` (/24 or /64), `retryAfter`, `sample` | `limitClient`, one 429 in 10 |
| `security.bot_blocked` | info | `route` (the template, `/api/locations/[id]`, as on other lines) | `refuseBots` |
| `security.auth_failed` | info | `type` (`login`), `code` (Better Auth's, e.g. `INVALID_EMAIL_OR_PASSWORD`), `status` (401, or 429 when its rate limit refused) | `/api/auth/login` |
| `auth.email_failed` | error | `template`, SMTP `code` and `responseCode` | `sendAccountEmail` |
| `auth.error`, `auth.background_failed` | error | error fields, or `status` for a 5xx answer | Better Auth, through `authHandler` (with `onAPIError.throw`, so its router never prints an error raw) |
| `mcp.request_failed`, `mcp.tool_failed`, `mcp.error` | error | `tool`, error fields | `src/server/mcp` |
| `rate_limit.check_failed`, `botid.check_failed` | error | `rule` / `route` | the limiter or BotID failed; the request went through |

Each admin line is also written with `outcome: "error"` when the action throws, so a failed attempt still says who tried what. The admin trail lives only in the logs for now. The database keeps the latest actor on each row, not the history (see "Open decisions").

Role changes (QA-4) should log `admin.role.change` with `audit(l, "role.change", { actorId, target: userId, outcome, role })` once that route exists.

## Searching the logs

In the Vercel dashboard, **Logs** (or `vercel logs <deployment>`), search a field's value as text: `"event":"db.slow"`, `"code":"23505"`, `"route":"/api/reviews"`, `"actorId":"<uuid>"`. A request's lines share `requestId` (Vercel's `x-vercel-id`), and the same id is on the request in Vercel's request log. Filter **Level: Error** for `warn` and `error` lines.

Locally, the lines go to the terminal running `next dev`. Pipe them through `jq` to read them: `npm run dev 2>&1 | grep '^{' | jq .`

## Retention

Vercel keeps runtime logs 1 hour on Hobby, 1 day on Pro, and 30 days on Pro with Observability Plus. Log drains need Pro and cost $0.50/GB.

**Decision: pending.** Nobody has yet confirmed which plan the project is on, and this change doesn't touch Vercel's settings. Recommendation:

- **On Pro:** add a log drain to a cheap log service with 14–30 days of history, so a bug reported the next morning can still be looked into.
- **On Hobby:** logs last an hour, so anything that has to last belongs in the database (job runs in `job_runs`, the assistant's turns in `assistant_turns`, and an admin audit table, below).

Whoever settles it: record the plan and the choice here.

## Open decisions

- **An admin audit table.** Logs expire, and the moderation columns keep only the latest actor. Recommendation: a follow-up ticket for an `admin_audit_log` table written in the same transaction as each change, the only option that lasts on Hobby.
- **pino or OpenTelemetry:** not now. The JSON wrapper is enough for Vercel's log capture.
