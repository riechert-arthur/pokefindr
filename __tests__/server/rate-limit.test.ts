// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { clientIp, tokenBucket } from "@/server/lib/rate-limit"

describe("tokenBucket", () => {
  it("allows a burst, then refills at the sustained rate", () => {
    let t = 0
    const limiter = tokenBucket({ perMinute: 60, burst: 3, now: () => t })
    expect([1, 2, 3, 4].map(() => limiter.take("a"))).toEqual([true, true, true, false])
    t += 1000 // one token a second
    expect(limiter.take("a")).toBe(true)
    expect(limiter.take("a")).toBe(false)
  })

  it("never refills past the burst", () => {
    let t = 0
    const limiter = tokenBucket({ perMinute: 60, burst: 2, now: () => t })
    t += 60_000
    expect([1, 2, 3].map(() => limiter.take("a"))).toEqual([true, true, false])
  })

  it("forgets the least recently used key past maxKeys", () => {
    const limiter = tokenBucket({ perMinute: 1, burst: 1, maxKeys: 2, now: () => 0 })
    limiter.take("a")
    limiter.take("b")
    limiter.take("c") // drops "a"
    expect(limiter.take("a")).toBe(true)
    expect(limiter.take("c")).toBe(false)
  })
})

describe("clientIp", () => {
  it("takes the first X-Forwarded-For entry, then X-Real-IP", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe("203.0.113.5")
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.6" }))).toBe("203.0.113.6")
    expect(clientIp(new Headers())).toBe("unknown")
  })
})
