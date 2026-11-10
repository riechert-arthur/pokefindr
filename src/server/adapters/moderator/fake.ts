import { noUsage, type ContentModerator, type ModerationCategory, type ModerationOptions, type ModerationResult } from "@/server/ports/moderator"

/**
 * A few keyword rules, for local dev, CI and tests: no account, no cost, and
 * the same answer every time. It catches the obvious cases in the policy
 * (docs/moderation.md) and nothing subtle; the claude adapter is the real one.
 */
const RULES: { category: ModerationCategory; block: boolean; pattern: RegExp }[] = [
  { category: "threat", block: true, pattern: /\b(i('| a)?m going to|i('ll| will)|gonna)\s+(kill|hurt|stab|shoot|beat up|find)\b|\bkill (you|him|her|them|yourself)\b|\bburn (it|this place|the store) down\b/i },
  {
    category: "harassment",
    block: false,
    pattern: /\b(idiot|moron|retard\w*|loser|scum|piece of (shit|garbage)|f+u+c*k+ (you|off|him|her|them)|stfu|go die|kys|subhuman|vermin)\b|\b(you|he|she|they)('re| are) (stupid|trash|pathetic|worthless)\b/i,
  },
  { category: "sexual", block: false, pattern: /\b(nudes?|sexy|porn\w*|onlyfans|horny|sex(ual)?)\b/i },
  // A US phone number, an email address, or "lives at <number> <street>".
  { category: "personal_info", block: true, pattern: /\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b|\b[\w.+-]+@[\w-]+\.[\w.]+\b|\blives (at|on)\s+\d+/i },
  { category: "scalping", block: false, pattern: /\b(dm|message|text) me (for|to buy)\b|\bselling (packs|boxes|etbs?|cases)\b|\b(i|we) (sell|resell|flip)\b|\bbelow (market|msrp)\b.*\b(dm|contact)\b|\bscalp\w*\s+(link|discord|group)\b|\bcheckout bot\b/i },
  { category: "spam", block: false, pattern: /\b(promo|discount|referral|coupon) code\b|\bfollow (me|us) on\b|\buse code\b|\bvisit (my|our) (shop|store|site|channel)\b|\bbuy now\b|\bclick (here|the link)\b|https?:\/\/(?!(www\.)?pokemon\.com)/i },
  {
    category: "injection",
    block: true,
    pattern: /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|rules|prompt|policy)\b|\bsystem prompt\b|\byou are now\b|\bjailbreak\b|\bdeveloper mode\b|\bmoderator:\s*(approve|allow)\b/i,
  },
]

export const FAKE_MODEL = "fake"
export const FAKE_PROMPT_VERSION = "fake-1"

export class FakeModerator implements ContentModerator {
  async check(text: string, opts: ModerationOptions): Promise<ModerationResult> {
    if (opts.signal?.aborted) throw opts.signal.reason ?? new Error("aborted")
    const hits = RULES.filter((r) => r.pattern.test(text))
    const base = { model: FAKE_MODEL, promptVersion: FAKE_PROMPT_VERSION, usage: noUsage() }
    if (hits.length === 0) return { ...base, verdict: "allow", categories: [], reason: "No rule matched." }
    const categories = [...new Set(hits.map((h) => h.category))]
    return {
      ...base,
      verdict: hits.some((h) => h.block) ? "block" : "hold",
      categories,
      reason: `Matched the ${categories.join(", ").replace(/_/g, " ")} rule${categories.length === 1 ? "" : "s"}.`,
    }
  }
}
