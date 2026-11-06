import "server-only"
import { send } from "@vercel/queue"
import { getServerConfig } from "@/server/config"
import { isJobName, type JobName } from "./registry"
import { runJob } from "./run"
import type { JobResult } from "./types"

/** The one Vercel Queues topic. Messages carry the job name, so adding a job needs no new topic. */
export const JOBS_TOPIC = "jobs"

export interface JobMessage {
  job: JobName
  payload: unknown
}

export interface EnqueueOptions {
  /** Deduplicates sends for 24 hours (e.g. `submission-created:<id>`). At most 256 characters. */
  idempotencyKey?: string
  delaySeconds?: number
}

export type EnqueueResult =
  | { mode: "queued"; messageId: string | null }
  | { mode: "inline"; result: JobResult }

/**
 * Runs a job in the background. On Vercel it publishes to Vercel Queues, and
 * `/api/queues/jobs` runs it with retries. Anywhere else (local dev, tests,
 * another host) it runs the job inline and waits for it.
 *
 * This is the only module that sends to Vercel Queues. To move off Vercel,
 * replace the `send` call here and the consumer route; jobs don't change.
 *
 * Keep payloads small (ids, not documents): every 4 KiB is billed as an operation.
 */
export async function enqueueJob(job: JobName, payload: unknown = null, options: EnqueueOptions = {}): Promise<EnqueueResult> {
  if (!isJobName(job)) throw new Error(`Unknown job: ${String(job)}`)

  if (getServerConfig().VERCEL) {
    const message: JobMessage = { job, payload }
    const { messageId } = await send(JOBS_TOPIC, message, {
      idempotencyKey: options.idempotencyKey,
      delaySeconds: options.delaySeconds,
    })
    return { mode: "queued", messageId }
  }

  return { mode: "inline", result: await runJob(job, payload, { trigger: "inline" }) }
}
