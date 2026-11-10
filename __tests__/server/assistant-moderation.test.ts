// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { BLOCKED_REPLY, addCheckUsage, emitBlocked, moderationFlags } from "@/server/assistant/moderation"
import { flagsFor } from "@/server/assistant/log"
import type { AssistantEvent } from "@/lib/types/assistant-stream"

const usage = { inputTokens: 700, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 95 }

describe("the assistant's question check", () => {
  it("flags held and blocked questions as moderated, and a check that didn't run as moderation_error", () => {
    expect(moderationFlags({ verdict: "allow" })).toEqual([])
    expect(moderationFlags({ verdict: "hold" })).toEqual(["moderated"])
    expect(moderationFlags({ verdict: "block" })).toEqual(["moderated"])
    expect(moderationFlags({ verdict: "allow", failed: true })).toEqual(["moderation_error"])
    expect(moderationFlags(null)).toEqual([])
  })

  it("adds the same flags in the turn log", () => {
    const base = { question: "machines near me", tools: [], costMicros: 0 }
    expect(flagsFor({ ...base, outcome: "blocked", moderation: { verdict: "block" } })).toEqual(["moderated"])
    expect(flagsFor({ ...base, outcome: "answered", moderation: { verdict: "hold" } })).toEqual(["moderated"])
    expect(flagsFor({ ...base, outcome: "answered", moderation: { verdict: "allow", failed: true } })).toEqual(["moderation_error"])
    expect(flagsFor({ ...base, outcome: "answered", moderation: { verdict: "allow" } })).toEqual([])
    expect(flagsFor({ ...base, outcome: "answered" })).toEqual([])
  })

  it("adds the check's cost to the turn's usage", () => {
    const u = { inputTokens: 10, outputTokens: 1, cacheReadTokens: 2, cacheWriteTokens: 3, costMicros: 5 }
    addCheckUsage(u, { verdict: "allow", categories: [], reason: "", model: "m", promptVersion: "p", usage })
    expect(u).toEqual({ inputTokens: 710, outputTokens: 51, cacheReadTokens: 2, cacheWriteTokens: 3, costMicros: 100 })
  })

  it("answers a blocked question with the canned reply, ending like a refusal", () => {
    const out: AssistantEvent[] = []
    emitBlocked((e) => out.push(e), usage, "claude-haiku-5-5")
    expect(out).toEqual([
      { type: "text", text: BLOCKED_REPLY },
      { type: "done", stop: "refusal", memory: BLOCKED_REPLY, usage, model: "claude-haiku-5-5" },
    ])
  })
})
