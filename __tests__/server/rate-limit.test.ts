// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { clientIp, rateLimitKey, tokenBucket } from "@/server/lib/rate-limit"

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

describe("rateLimitKey", () => {
  it("keys IPv6 on its /64 and keeps IPv4 as is", () => {
    expect(rateLimitKey("203.0.113.5")).toBe("203.0.113.5")
    expect(rateLimitKey("::ffff:203.0.113.5")).toBe("203.0.113.5")
    expect(rateLimitKey("2001:db8:85a3:0042:1000:8a2e:0370:7334")).toBe("2001:db8:85a3:42::/64")
    expect(rateLimitKey("2001:db8:85a3:42::1")).toBe("2001:db8:85a3:42::/64")
    expect(rateLimitKey("2001:DB8::1")).toBe("2001:db8:0:0::/64")
    expect(rateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64")
    expect(rateLimitKey("unknown")).toBe("unknown")
  })

  it("gives every address in one /64 the same key", () => {
    const keys = new Set(["2001:db8:1:2::a", "2001:db8:1:2:ffff::b", "2001:db8:1:2:1:2:3:4"].map(rateLimitKey))
    expect(keys.size).toBe(1)
  })
})
