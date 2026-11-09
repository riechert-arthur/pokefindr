import "server-only"
import type { MessageMetadata, RetryDirective } from "@vercel/queue"
import { z } from "zod/v3"
import { getServerConfig } from "@/server/config"
import { InvalidJobPayloadError, runJob, UnknownJobError } from "./run"
import { verifyJobMessage } from "./signing"

/**
 * Deliveries before a failing message is dropped, and the first retry delay.
 * Keep `maxDeliveries` and `retryAfterSeconds` in vercel.json equal to these:
 * Vercel applies its own values when the function crashes or times out and
 * {@link retryJobMessage} never runs.
 */
export const MAX_DELIVERIES = 8
export const FIRST_RETRY_SECONDS = 10

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
 * - a job that throws is retried with backoff by {@link retryJobMessage}.
 */
export async function handleJobMessage(message: unknown, metadata: MessageMetadata): Promise<void> {
  const where = { messageId: metadata.messageId, deliveryCount: metadata.deliveryCount }
  const parsed = jobMessageSchema.safeParse(message)
  if (!parsed.success) {
    console.error("[jobs] dropping malformed queue message", where)
    return
  }
  const { job, body, sig } = parsed.data

  const secret = getServerConfig().CRON_SECRET
  if (!secret || !verifyJobMessage(job, body, sig, secret)) {
    console.error("[jobs] dropping queue message with a bad signature", { ...where, job, secretConfigured: Boolean(secret) })
    return
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    console.error("[jobs] dropping queue message with an unreadable body", { ...where, job })
    return
  }

  try {
    await runJob(job, payload, { trigger: "queue", ...where })
  } catch (err) {
    if (err instanceof InvalidJobPayloadError) {
      console.error("[jobs] dropping queue message with an invalid payload", { ...where, job, issues: err.issues })
      return
    }
    if (err instanceof UnknownJobError) {
      console.warn("[jobs] unknown job; retrying in case a newer deployment knows it", { ...where, job })
    }
    throw err
  }
}

/** Exponential backoff (10 s, 20 s, 40 s… capped at 10 min); gives up after {@link MAX_DELIVERIES}. */
export function retryJobMessage(_error: unknown, metadata: MessageMetadata): RetryDirective {
  if (metadata.deliveryCount >= MAX_DELIVERIES) {
    console.error("[jobs] giving up on queue message", { messageId: metadata.messageId, deliveries: metadata.deliveryCount })
    return { acknowledge: true }
  }
  return { afterSeconds: Math.min(600, FIRST_RETRY_SECONDS * 2 ** (metadata.deliveryCount - 1)) }
}
