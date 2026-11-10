import "server-only"
import { getModerator } from "@/server/container"
import { noUsage, type ContentModerator, type ModerationOptions, type ModerationResult, type ModerationVerdict } from "@/server/ports/moderator"

/** How long a review waits for its check before it's held (#253). */
export const REVIEW_CHECK_TIMEOUT_MS = 3_000

/**
 * Runs one check with a deadline. When the moderator fails or is too slow,
 * the result is `fallback` with `failed: true`, so callers decide what an
 * outage means: reviews are held, the assistant goes ahead.
 */
export async function moderate(
  text: string,
  opts: Omit<ModerationOptions, "signal"> & { timeoutMs: number; fallback: ModerationVerdict; moderator?: ContentModerator; signal?: AbortSignal },
): Promise<ModerationResult> {
  const { timeoutMs, fallback, moderator: given, signal: outer, ...rest } = opts
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = outer ? AbortSignal.any([outer, timeout]) : timeout
  let moderator: ContentModerator
  try {
    moderator = given ?? getModerator()
  } catch (err) {
    console.error("[moderation] couldn't set up the moderator", err)
    return failedResult(fallback, "unconfigured")
  }
  try {
    // The race covers an adapter that ignores the signal.
    return await Promise.race([
      moderator.check(text, { ...rest, signal }),
      new Promise<never>((_, reject) => timeout.addEventListener("abort", () => reject(timeout.reason), { once: true })),
    ])
  } catch (err) {
    const timedOut = timeout.aborted
    console.error(JSON.stringify({ event: "moderation_failed", kind: rest.kind, timedOut, error: err instanceof Error ? err.name : String(err) }))
    return failedResult(fallback, timedOut ? "timeout" : "error")
  }
}

function failedResult(verdict: ModerationVerdict, why: "timeout" | "error" | "unconfigured"): ModerationResult {
  const reason = { timeout: "The check took too long, so it will run again.", error: "The check failed, so it will run again.", unconfigured: "No moderator is configured." }[why]
  return { verdict, categories: [], reason, model: "none", promptVersion: "none", usage: noUsage(), failed: true }
}
