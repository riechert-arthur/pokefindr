// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { costMicros } from "@/server/assistant/pricing"

describe("costMicros", () => {
  it("prices tokens at the model's per-million rates, in millionths of a dollar", () => {
    // Claude Opus 5.5: $4 in, $20 out, $0.20 cache read, $5 cache write per million.
    expect(costMicros("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(4_000_000)
    expect(costMicros("claude-opus-5-5", { inputTokens: 100, outputTokens: 20, cacheReadTokens: 50, cacheWriteTokens: 10 })).toBe(860)
  })

  it("prices an unknown model as the most expensive one, rounding up", () => {
    expect(costMicros("claude-next", { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(10)
    expect(costMicros("claude-haiku-5-5", { inputTokens: 1, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(1)
  })
})
