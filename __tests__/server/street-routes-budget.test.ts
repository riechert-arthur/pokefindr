// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { providerBudget } from "@/server/services/street-routes"

describe("providerBudget (#288, #348)", () => {
  it("keeps to 30 a minute and the daily cap by default", () => {
    expect(providerBudget(1800)).toEqual([
      { name: "router-minute", perMinute: 30, burst: 30 },
      { name: "router-day", perMinute: 900 / (24 * 60), burst: 900 },
    ])
  })

  it("uses a provider's own stricter limit, such as OSRM's demo server at one a second", () => {
    expect(providerBudget(1800, { perMinute: 60, burst: 1 })[0]).toEqual({ name: "router-minute", perMinute: 60, burst: 1 })
  })
})
