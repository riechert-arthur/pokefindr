import "server-only"
import type { MessageMetadata, RetryDirective } from "@vercel/queue"
import { z } from "zod/v3"
import { getServerConfig } from "@/server/config"
import { enqueueJob } from "./enqueue"
import { InvalidJobPayloadError, JobPausedError, runJob, UnknownJobError } from "./run"
import { verifyJobMessage } from "./signing"
import { log } from "@/server/log"

/**
 * Deliveries before a failing message is dropped, and the first retry delay.
 * Keep `maxDeliveries` and `retryAfterSeconds` in vercel.json equal to these:
 * Vercel applies its own values when the function crashes or times out and
 * {@link retryJobMessage} never runs.
 */
export const MAX_DELIVERIES = 8
export const FIRST_RETRY_SECONDS = 10
/** How often a message for a paused job checks again whether the job is back on. */
export const PAUSED_RECHECK_SECONDS = 10 * 60

const jobMessageSchema = z.object({
  v: z.literal(1),
  job: z.string().min(1),
  body: z.string(),
  sig: z.string().min(1),
})

/**
 * Handles one message from the `jobs` topic:
 * - malformed, unsigned or badly signed messages are logged and acknowledged
 *   (they didn't come from `enqueueJob()`, and retrying can't fix them);
 * - an invalid payload is logged and acknowledged for the same reason;
 * - an unknown job name is retried: during a rollout, a message for a newly
 *   added job can reach a deployment that doesn't know it yet;
 * - a paused job's message goes back on the queue as a new message, delayed
 *   {@link PAUSED_RECHECK_SECONDS}, so it isn't used up against
 *   MAX_DELIVERIES and runs once the job is resumed;
 * - a job that throws is retried with backoff by {@link retryJobMessage}.
 */
export async function handleJobMessage(message: unknown, metadata: MessageMetadata): Promise<void> {
  const where = { messageId: metadata.messageId, deliveryCount: metadata.deliveryCount }
  const parsed = jobMessageSchema.safeParse(message)
  if (!parsed.success) {
    log.error("job.message_dropped", { ...where, reason: "malformed" })
    return
  }
  const { job, body, sig } = parsed.data

  const secret = getServerConfig().CRON_SECRET
  if (!secret || !verifyJobMessage(job, body, sig, secret)) {
    log.error("job.message_dropped", { ...where, job, reason: "bad_signature", secretConfigured: Boolean(secret) })
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    log.error("job.message_dropped", { ...where, job, reason: "unreadable_body" })
    return
  }

  try {
    await runJob(job, payload, { trigger: "queue", ...where })
  } catch (err) {
    if (err instanceof JobPausedError) {
      log.info("job.message_held", { ...where, job, reason: err.reason })
      // If this send fails, the throw below lets the queue redeliver the original.
      await enqueueJob(job, payload, { delaySeconds: PAUSED_RECHECK_SECONDS })
      return
    }
    if (err instanceof InvalidJobPayloadError) {
      log.error("job.message_dropped", { ...where, job, reason: "invalid_payload", issues: err.issues })
      return
    }
    if (err instanceof UnknownJobError) {
      log.warn("job.unknown", { ...where, job, retrying: true })
    }
    throw err
  }
}

/** Exponential backoff (10 s, 20 s, 40 s… capped at 10 min); gives up after {@link MAX_DELIVERIES}. */
export function retryJobMessage(_error: unknown, metadata: MessageMetadata): RetryDirective {
  if (metadata.deliveryCount >= MAX_DELIVERIES) {
    log.error("job.gave_up", { messageId: metadata.messageId, deliveries: metadata.deliveryCount })
    return { acknowledge: true }
  }
  return { afterSeconds: Math.min(600, FIRST_RETRY_SECONDS * 2 ** (metadata.deliveryCount - 1)) }
}
