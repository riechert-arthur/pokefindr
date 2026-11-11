import "server-only"
import { send } from "@vercel/queue"
import { getServerConfig } from "@/server/config"
import { isJobName } from "./registry"
import { runJob, UnknownJobError } from "./run"
import { signJobMessage } from "./signing"
import { log } from "@/server/log"

/** The one Vercel Queues topic. Messages carry the job name, so adding a job needs no new topic. */
export const JOBS_TOPIC = "jobs"

/**
 * What goes on the queue. `body` is the payload serialized once, so the
 * signature covers the exact text the consumer parses.
 */
export interface JobMessage {
  v: 1
  job: string
  body: string
  sig: string
}

export interface EnqueueOptions {
  /** Deduplicates sends for 24 hours (e.g. `submission-created:<id>`). At most 256 characters. Vercel only. */
  idempotencyKey?: string
  delaySeconds?: number
}

export type EnqueueResult =
  | { mode: "queued"; messageId: string | null }
  /** `done` settles when the background run finishes. Callers normally ignore it; tests await it. */
  | { mode: "inline"; done: Promise<void> }

/**
 * Runs a job in the background and returns at once.
 *
 * - On Vercel: publishes a signed message to Vercel Queues, and
 *   `/api/queues/jobs` runs it with retries.
 * - Anywhere else (local dev, tests, another host): starts the job in this
 *   process without blocking the caller. `delaySeconds` is honored with a
 *   timer. There are no retries or idempotency keys; failures are logged, not
 *   thrown. On serverless hosts other than Vercel, the run may be cut short
 *   when the response ends.
 *
 * This is the only module that sends to Vercel Queues. To move off Vercel,
 * replace the `send` call here and the consumer route; jobs don't change.
 *
 * Keep payloads small (ids, not documents): every 4 KiB is billed as an operation.
 */
export async function enqueueJob(job: string, payload: unknown = null, options: EnqueueOptions = {}): Promise<EnqueueResult> {
  if (!isJobName(job)) throw new UnknownJobError(job)
  const config = getServerConfig()

  if (config.VERCEL) {
    if (!config.CRON_SECRET) throw new Error("CRON_SECRET must be set to enqueue jobs (it signs queue messages)")
    const body = JSON.stringify(payload ?? null)
    const message: JobMessage = { v: 1, job, body, sig: signJobMessage(job, body, config.CRON_SECRET) }
    const { messageId } = await send(JOBS_TOPIC, message, {
      idempotencyKey: options.idempotencyKey,
      delaySeconds: options.delaySeconds,
    })
    return { mode: "queued", messageId }
  }

  if (options.idempotencyKey) {
    log.info("job.idempotency_ignored", { job })
  }
  const done = new Promise<void>((resolve) => {
    setTimeout(() => {
      runJob(job, payload, { trigger: "inline" })
        .catch(() => {}) // runJob already logged it; never surface to the caller
        .finally(resolve)
    }, Math.max(0, options.delaySeconds ?? 0) * 1000)
  })
  return { mode: "inline", done }
}
