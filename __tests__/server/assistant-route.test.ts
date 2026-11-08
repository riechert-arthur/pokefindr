// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

const { nearestFirst, directionsUrl } = await import("@/server/assistant/tools")

const a = { id: "a", lng: 0, lat: 0 }
const b = { id: "b", lng: 0, lat: 0.1 }
const c = { id: "c", lng: 0, lat: 0.05 }

describe("nearestFirst", () => {
  it("starts at the first stop without a start, always going to the closest next", () => {
    const r = nearestFirst([a, b, c], null)
    expect(r.order.map((p) => p.id)).toEqual(["a", "c", "b"])
    expect(r.legs[0]).toBe(0)
    expect(r.total).toBeCloseTo(r.legs[1] + r.legs[2])
  })

  it("starts from the start point, with a leg to the first stop", () => {
    const r = nearestFirst([a, b, c], { lng: 0, lat: 0.11 })
    expect(r.order.map((p) => p.id)).toEqual(["b", "c", "a"])
    expect(r.legs[0]).toBeGreaterThan(0)
  })
})

describe("directionsUrl", () => {
  it("goes from the origin through the middle stops to the last", () => {
    const url = new URL(directionsUrl(a, [a, c, b]))
    expect(url.searchParams.get("origin")).toBe("0.00000,0.00000")
    expect(url.searchParams.get("waypoints")).toBe("0.05000,0.00000")
    expect(url.searchParams.get("destination")).toBe("0.10000,0.00000")
    expect(url.searchParams.get("travelmode")).toBe("driving")
  })
})
