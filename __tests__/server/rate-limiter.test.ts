// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
import { MemoryRateLimiter } from "@/server/adapters/rate-limiter/memory"

const rule = { name: "test", perMinute: 60, burst: 3 }

describe("MemoryRateLimiter (#199)", () => {
  it("lets a burst through, then refills a token at the rule's rate", async () => {
    let now = 0
    const limiter = new MemoryRateLimiter(() => now)
    for (let i = 0; i < 3; i++) expect((await limiter.take(rule, "a")).ok).toBe(true)
    expect(await limiter.take(rule, "a")).toEqual({ ok: false, retryAfter: 1 })
    expect((await limiter.take(rule, "b")).ok).toBe(true)
    now += 1000
    expect((await limiter.take(rule, "a")).ok).toBe(true)
    expect((await limiter.take({ ...rule, name: "other" }, "a")).ok).toBe(true)
  })
})
