import "server-only"
import { moderate } from "@/server/services/content-moderation"
import type { ContentModerator, ModerationResult } from "@/server/ports/moderator"
import type { AssistantEvent, AssistantUsage } from "@/lib/types/assistant-stream"
import { REFUSAL_REPLY } from "./run"

/**
 * The assistant's input check (#253, docs/moderation.md): the viewer's
 * messages are checked as the turn starts, every one the model will read,
 * since the page sends the history and anyone can write it. A "block" never
 * reaches the assistant's model; a "hold" only flags the turn for review. A
 * check that fails or takes longer than this lets the turn go ahead (fail
 * open), with a `moderation_error` flag.
 */
export const QUESTION_CHECK_TIMEOUT_MS = 1_500

/** What a blocked question gets back instead of an answer: the same words as a refusal. */
export const BLOCKED_REPLY = REFUSAL_REPLY

/** Separates a conversation's questions in one check. */
const SEPARATOR = "\n\n---\n\n"

/**
 * Checks the viewer's messages, oldest first, the newest last, in one call.
 * The page leaves a blocked exchange out of what it sends next, so an honest
 * conversation goes on after a block; a history with one in it is blocked again.
 */
export function checkQuestion(questions: string | readonly string[], opts: { moderator?: ContentModerator; signal?: AbortSignal } = {}): Promise<ModerationResult> {
  const all = typeof questions === "string" ? [questions] : questions
  return moderate(all.join(SEPARATOR), {
    kind: "question",
    ...(all.length > 1 && { context: `${all.length} messages from one conversation with the assistant, oldest first, separated by "---". Judge each of them.` }),
    timeoutMs: QUESTION_CHECK_TIMEOUT_MS,
    fallback: "allow",
    ...opts,
  })
}

/** Adds a check's cost to the turn's, so it counts toward the daily budget and the turn log. */
export function addCheckUsage(usage: AssistantUsage, check: ModerationResult) {
  usage.inputTokens += check.usage.inputTokens
  usage.outputTokens += check.usage.outputTokens
  usage.cacheReadTokens += check.usage.cacheReadTokens
  usage.cacheWriteTokens += check.usage.cacheWriteTokens
  usage.costMicros += check.usage.costMicros
}

/** A blocked turn, as the page sees it: the canned reply, then `done` like a refusal, marked `blocked`. */
export function emitBlocked(emit: (e: AssistantEvent) => void, usage: AssistantUsage, model: string) {
  emit({ type: "text", text: BLOCKED_REPLY })
  emit({ type: "done", stop: "refusal", blocked: true, memory: BLOCKED_REPLY, usage: { ...usage }, model })
}
