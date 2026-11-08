import "server-only"

/** Dollars per million tokens. */
interface Price {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
}

/**
 * First-party API prices for the models the assistant may run on (a
 * refusal fallback can answer on another one). An unknown model is priced
 * as the most expensive listed, so the spend caps err on the safe side.
 */
const PRICES: Record<string, Price> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-fable-5-1": { input: 10, output: 50, cacheRead: 0.25, cacheWrite: 12.5 },
}
const MOST: Price = PRICES["claude-fable-5-1"]

export interface TokenCounts {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** What these tokens cost on `model`, in millionths of a dollar (rounded up). */
export function costMicros(model: string, t: TokenCounts): number {
  const p = PRICES[model] ?? MOST
  // $ per million tokens is exactly micro-dollars per token.
  return Math.ceil(t.inputTokens * p.input + t.outputTokens * p.output + t.cacheReadTokens * p.cacheRead + t.cacheWriteTokens * p.cacheWrite)
}
