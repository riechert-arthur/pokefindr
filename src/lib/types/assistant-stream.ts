import type { AssistantCard } from "./assistant"

/** One message of the conversation the page sends back each turn. */
export interface AssistantTurn {
  role: "user" | "assistant"
  /** The viewer's message, or the `memory` of an assistant turn. */
  content: string
}

/** Tokens one turn used, over all its model calls. */
export interface AssistantUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** What they cost, in millionths of a dollar. */
  costMicros: number
}

/**
 * POST /api/assistant streams these as NDJSON, one per line: text as it's
 * written, a status while a tool runs, each tool's card, then `done` (or
 * `error`).
 */
export type AssistantEvent =
  | { type: "text"; text: string }
  | { type: "status"; text: string }
  | { type: "card"; card: AssistantCard }
  | {
      type: "done"
      /** Why the turn ended: an answer, the output cap, a refusal, or too many tool rounds. */
      stop: "end_turn" | "max_tokens" | "refusal" | "tool_limit"
      /** Send this back as the turn's assistant message. */
      memory: string
      usage: AssistantUsage
      model: string
      /** The turn's id in the log, for feedback on it. Set by /api/assistant. */
      turnId?: string
    }
  | { type: "error"; message: string }
