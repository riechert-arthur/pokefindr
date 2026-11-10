/**
 * Checks what people write before others see it (#253): reviews, and the
 * assistant's questions. Adapters live in `src/server/adapters/moderator/`;
 * `getModerator()` (src/server/container.ts) picks one from config. The
 * policy they apply is `docs/moderation.md`.
 */

/** What is being checked: a review's text, a submitted place's fields, a question to the assistant, or one of its answers. */
export type ModerationKind = "review" | "submission" | "question" | "answer"

/**
 * Why text was held or blocked. Kept short and stable: they're stored with
 * each check, counted by the eval and shown to moderators.
 */
export const MODERATION_CATEGORIES = [
  /** Insults or attacks on a person, slurs, hate against a group. */
  "harassment",
  /** Threats of violence or harm. */
  "threat",
  /** Sexual content. */
  "sexual",
  /** Phone numbers, emails, home addresses or full names of private people. */
  "personal_info",
  /** Ads, self-promotion, referral codes, unrelated links. */
  "spam",
  /** Resale at a markup, bots, "DM me for packs", scalping links. */
  "scalping",
  /** Text trying to change the assistant's or a moderator's instructions. */
  "injection",
  /** Rants or text with nothing to do with the place or Pokémon cards. */
  "off_topic",
] as const
export type ModerationCategory = (typeof MODERATION_CATEGORIES)[number]

/**
 * - allow: publish or answer as usual.
 * - hold: a person should look first (a review waits in the queue; a question is only flagged).
 * - block: the clearest cases (slurs, threats, personal details, injection). Reviews still keep the row for a moderator.
 */
export type ModerationVerdict = "allow" | "hold" | "block"

export interface ModerationUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  /** Millionths of a dollar. */
  costMicros: number
}

export interface ModerationResult {
  verdict: ModerationVerdict
  categories: ModerationCategory[]
  /** One sentence a moderator can read. */
  reason: string
  /** Which model (or "fake") decided. */
  model: string
  /** Which prompt and policy decided, so verdicts can be compared across changes. */
  promptVersion: string
  /** What the check cost; zero for the fake. */
  usage: ModerationUsage
  /**
   * The check didn't run (an API error or a timeout): the verdict is the
   * caller's fallback, not a decision. Held reviews with a failed check are
   * checked again by the `recheck-held-reviews` job.
   */
  failed?: boolean
}

export interface ModerationOptions {
  kind: ModerationKind
  /** What the text is about, e.g. "A review of a vending machine at Target, Denver, CO". Not user-written. */
  context?: string
  signal?: AbortSignal
}

export interface ContentModerator {
  /** Checks one piece of text. Throws only when the check couldn't run (network, API, abort). */
  check(text: string, opts: ModerationOptions): Promise<ModerationResult>
}

export const noUsage = (): ModerationUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0 })
