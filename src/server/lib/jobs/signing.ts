import "server-only"
import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Queue messages are signed so the consumer only runs jobs that `enqueueJob()`
 * sent. `@vercel/queue`'s `handleCallback` takes the payload from the request
 * body without checking who sent it, so without this the consumer would run
 * any well-formed request (see PR #87). Vercel is meant to keep the consumer
 * private, and this check holds even if that protection is missing.
 *
 * The key is derived from CRON_SECRET, so there's no second secret to manage,
 * and it's kept separate from the bearer check by a fixed label.
 */
const LABEL = "pokefindr:jobs:queue-signing:v1"

function key(secret: string): Buffer {
  return createHmac("sha256", secret).update(LABEL).digest()
}

/** Signs the exact message text (job name and serialized payload). */
export function signJobMessage(job: string, body: string, secret: string): string {
  return createHmac("sha256", key(secret)).update(`${job}\n${body}`).digest("base64url")
}

/** Constant-time check of a signature from {@link signJobMessage}. */
export function verifyJobMessage(job: string, body: string, signature: string, secret: string): boolean {
  const expected = Buffer.from(signJobMessage(job, body, secret))
  const actual = Buffer.from(signature)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
