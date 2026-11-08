import { describe, expect, it } from "vitest"
import { HISTORY_LIMITS, clipHistory, memoryOf } from "@/lib/assistant/memory"

describe("clipHistory", () => {
  it("keeps the last turns, starting with the viewer's, each within the API's limits", () => {
    const turns = Array.from({ length: 41 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), content: i === 39 ? `${"x".repeat(5000)} [ids]` : `m${i}` }))
    const out = clipHistory(turns)
    expect(out.length).toBeLessThanOrEqual(HISTORY_LIMITS.messages)
    expect(out[0].role).toBe("user")
    expect(out.at(-1)).toEqual({ role: "user", content: "m40" })
    const long = out.find((t) => t.content.endsWith("[ids]"))!
    expect(long.content.length).toBe(HISTORY_LIMITS.assistantChars)
  })
})

describe("memoryOf", () => {
  it("never returns an empty memory", () => {
    expect(memoryOf("  ", [])).toBe("(No answer.)")
  })
})
