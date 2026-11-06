import "server-only"
import type { MessageMetadata, RetryDirective } from "@vercel/queue"
import { z } from "zod"
import { isJobName } from "./registry"
import { runJob } from "./run"

/** Deliveries before a failing message is dropped. Each failure is logged by `runJob`. */
export const MAX_DELIVERIES = 8

const jobMessageSchema = z.object({ job: z.string(), payload: z.unknown() })

/**
 * Handles one message from the `jobs` topic. Malformed messages and unknown
 * jobs are logged and acknowledged (retrying can't fix them). A job that
 * throws is retried with backoff by {@link retryJobMessage}.
 */
export async function handleJobMessage(message: unknown, metadata: MessageMetadata): Promise<void> {
  const parsed = jobMessageSchema.safeParse(message)
  if (!parsed.success || !isJobName(parsed.data.job)) {
    console.error("[jobs] dropping invalid queue message", { messageId: metadata.messageId, message })
    return
  }
  await runJob(parsed.data.job, parsed.data.payload, {
    trigger: "queue",
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
  })
}

/** Exponential backoff (10 s, 20 s, 40 s… capped at 10 min); gives up after {@link MAX_DELIVERIES}. */
export function retryJobMessage(_error: unknown, metadata: MessageMetadata): RetryDirective {
  if (metadata.deliveryCount >= MAX_DELIVERIES) {
    console.error("[jobs] giving up on queue message", { messageId: metadata.messageId, deliveries: metadata.deliveryCount })
    return { acknowledge: true }
  }
  return { afterSeconds: Math.min(600, 10 * 2 ** (metadata.deliveryCount - 1)) }
}
