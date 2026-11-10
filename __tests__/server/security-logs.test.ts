// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { take, checkBotId } = vi.hoisted(() => ({ take: vi.fn(), checkBotId: vi.fn() }))
vi.mock("server-only", () => ({}))
vi.mock("@/server/container", () => ({ getRateLimiter: () => ({ take }) }))
vi.mock("botid/server", () => ({ checkBotId }))
vi.mock("@/server/edge-config", () => ({ onVercelProduction: () => false }))

import { guardRoute, ipPrefix, limitClient, RATE_RULES } from "@/server/api-rate-limit"

let info: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
  take.mockReset()
  checkBotId.mockReset()
})

const out = () => [...info.mock.calls].map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
const request = (ip: string) => new Request("https://pokefindr.test/api/locations/near?lat=47.61&lng=-122.33", { headers: { "x-forwarded-for": ip, "x-vercel-id": "r1" } })

describe("security lines (#254)", () => {
  it("keeps only the start of an IP: the /24 for IPv4, the /64 for IPv6", () => {
    expect(ipPrefix("203.0.113.77")).toBe("203.0.113.0/24")
    expect(ipPrefix("::ffff:203.0.113.77")).toBe("203.0.113.0/24")
    expect(ipPrefix("2001:db8:1:2:3:4:5:6")).toBe("2001:db8:1:2::/64")
    expect(ipPrefix("unknown")).toBe("unknown")
  })

  it("logs a sampled 429 with the rule and the IP's prefix, not the IP or the query", async () => {
    take.mockResolvedValue({ ok: false, retryAfter: 3 })
    vi.spyOn(Math, "random").mockReturnValue(0)
    const res = await limitClient(request("203.0.113.77"), RATE_RULES.locations)
    expect(res?.status).toBe(429)
    expect(out()).toEqual([
      { level: "info", event: "security.rate_limited", requestId: "r1", route: "/api/locations/near", rule: "locations", ipPrefix: "203.0.113.0/24", retryAfter: 3, sample: 10 },
    ])
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/203\.0\.113\.77|47\.61/)
  })

  it("logs nothing for a request that goes through", async () => {
    take.mockResolvedValue({ ok: true, retryAfter: 0 })
    expect(await limitClient(request("203.0.113.77"), RATE_RULES.locations)).toBeNull()
    expect(info).not.toHaveBeenCalled()
  })

  it("logs a BotID 403 with the route only", async () => {
    take.mockResolvedValue({ ok: true, retryAfter: 0 })
    checkBotId.mockResolvedValue({ isHuman: false, isBot: true, isVerifiedBot: false, bypassed: false })
    const res = await guardRoute(request("203.0.113.77"), RATE_RULES.locations, { bots: true })
    expect(res?.status).toBe(403)
    expect(out()).toEqual([{ level: "info", event: "security.bot_blocked", route: "/api/locations/near" }])
  })
})
