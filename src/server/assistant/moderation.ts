import "server-only"
import { moderate } from "@/server/services/content-moderation"
import type { ContentModerator, ModerationResult } from "@/server/ports/moderator"
import type { AssistantEvent, AssistantUsage } from "@/lib/types/assistant-stream"

/**
 * The assistant's input check (#253, docs/moderation.md): the newest
 * question is checked as the turn starts. A "block" never reaches the
 * assistant's model; a "hold" only flags the turn for review. A check that
 * fails or takes longer than this lets the turn go ahead (fail open), with
 * a `moderation_error` flag.
 */
export const QUESTION_CHECK_TIMEOUT_MS = 1_500

/** What a blocked question gets back instead of an answer. */
export const BLOCKED_REPLY = "I can't help with that one. Ask me about finding Pokémon cards: vending machines, card shops or events near you."

export function checkQuestion(question: string, opts: { moderator?: ContentModerator; signal?: AbortSignal } = {}): Promise<ModerationResult> {
  return moderate(question, { kind: "question", timeoutMs: QUESTION_CHECK_TIMEOUT_MS, fallback: "allow", ...opts })
}

/** Adds a check's cost to the turn's, so it counts toward the daily budget and the turn log. */
export function addCheckUsage(usage: AssistantUsage, check: ModerationResult) {
  usage.inputTokens += check.usage.inputTokens
  usage.outputTokens += check.usage.outputTokens
  usage.cacheReadTokens += check.usage.cacheReadTokens
  usage.cacheWriteTokens += check.usage.cacheWriteTokens
  usage.costMicros += check.usage.costMicros
}

/** A blocked turn, as the page sees it: the canned reply, then `done` like a refusal. */
export function emitBlocked(emit: (e: AssistantEvent) => void, usage: AssistantUsage, model: string) {
  emit({ type: "text", text: BLOCKED_REPLY })
  emit({ type: "done", stop: "refusal", memory: BLOCKED_REPLY, usage: { ...usage }, model })
}

/** The turn-log flags a check adds: `moderated` when it held or blocked the question, `moderation_error` when it didn't run. */
export function moderationFlags(check: Pick<ModerationResult, "verdict" | "failed"> | null | undefined): string[] {
  if (!check) return []
  if (check.failed) return ["moderation_error"]
  return check.verdict === "allow" ? [] : ["moderated"]
}
