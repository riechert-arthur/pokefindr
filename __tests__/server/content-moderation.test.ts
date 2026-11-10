// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { moderate } from "@/server/services/content-moderation"
import { FakeModerator } from "@/server/adapters/moderator/fake"
import type { ContentModerator } from "@/server/ports/moderator"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("moderate", () => {
  it("returns the moderator's verdict", async () => {
    expect(await moderate("Call me at 555-123-4567", { kind: "review", timeoutMs: 1000, fallback: "hold", moderator: new FakeModerator() })).toMatchObject({ verdict: "block", categories: ["personal_info"] })
  })

  it("falls back, marked failed, when the moderator throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const broken: ContentModerator = { check: async () => Promise.reject(new Error("API down")) }
    expect(await moderate("hi", { kind: "review", timeoutMs: 1000, fallback: "hold", moderator: broken })).toMatchObject({ verdict: "hold", failed: true, usage: { costMicros: 0 } })
    expect(await moderate("hi", { kind: "question", timeoutMs: 1000, fallback: "allow", moderator: broken })).toMatchObject({ verdict: "allow", failed: true })
  })

  it("falls back at the deadline, even when the moderator ignores the signal", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const slow: ContentModerator = { check: () => new Promise(() => {}) }
    const started = Date.now()
    const r = await moderate("hi", { kind: "review", timeoutMs: 50, fallback: "hold", moderator: slow })
    expect(r).toMatchObject({ verdict: "hold", failed: true })
    expect(r.reason).toMatch(/too long/)
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it("aborts the moderator's request at the deadline", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    let seen: AbortSignal | undefined
    const slow: ContentModerator = {
      check: (_t, o) => {
        seen = o.signal
        return new Promise(() => {})
      },
    }
    await moderate("hi", { kind: "review", timeoutMs: 20, fallback: "hold", moderator: slow })
    expect(seen?.aborted).toBe(true)
  })
})
