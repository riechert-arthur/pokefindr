import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "../../helpers/intl"
import { resetSearchCacheForTests, SEARCH_DEBOUNCE_MS, useSearch } from "@/components/search/useSearch"

const DENVER = { label: "Denver, CO", lng: -104.9849, lat: 39.7392, kind: "city", state: "CO" }
const COLORADO = { label: "Colorado", lng: -105.5, lat: 39, kind: "state", state: "CO" }
const KING_SOOPERS = {
  type: "Feature",
  id: "ks",
  geometry: { type: "Point", coordinates: [-104.97, 39.73] },
  properties: { id: "ks", machineID: "Q1", retailer: "King Soopers", address: "1155 E 9th Ave", city: "Denver", state: "CO", kind: "vending" },
}

/** Answers each API path; records every URL asked for. */
function mockApi(routes: Record<string, (url: URL) => unknown>) {
  const calls: URL[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input, "http://localhost")
      calls.push(url)
      if (init?.signal?.aborted) throw new DOMException("Aborted", "AbortError")
      const handler = routes[url.pathname]
      if (!handler) return new Response("{}", { status: 404 })
      const body = handler(url)
      return body instanceof Response ? body : new Response(JSON.stringify(body))
    }),
  )
  return calls
}

/** Lets the debounce fire and every pending fetch settle. */
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(SEARCH_DEBOUNCE_MS)
  })
  for (let i = 0; i < 5; i++) await act(async () => {})
}

beforeEach(() => {
  vi.useFakeTimers()
  resetSearchCacheForTests()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("useSearch", () => {
  it("waits for the debounce, then lists areas and locations with counts", async () => {
    const calls = mockApi({
      "/api/geocode": () => ({ results: [DENVER, COLORADO] }),
      "/api/locations/search": () => ({ type: "FeatureCollection", features: [KING_SOOPERS] }),
      "/api/locations/counts": () => ({ counts: [50] }),
      "/api/locations/aggregates": () => ({
        counts: [
          { country: "US", region: "CO", kind: "vending", count: 60 },
          { country: "US", region: "CO", kind: "shop", count: 3 },
          { country: "US", region: "WA", kind: "vending", count: 200 },
        ],
      }),
    })
    const { result } = renderHook(() => useSearch("Denver", { locations: true, near: [-105.04, 39.71] }))
    expect(result.current.status).toBe("loading")
    expect(calls).toHaveLength(0)

    await settle()
    expect(result.current.status).toBe("ready")
    expect(result.current.areas.map((a) => [a.label, a.count])).toEqual([
      ["Denver, CO", 50],
      ["Colorado", 63],
    ])
    expect(result.current.locations.map((f) => f.properties.retailer)).toEqual(["King Soopers"])

    const geocode = calls.find((u) => u.pathname === "/api/geocode")!
    expect(geocode.searchParams.get("near")).toBe("-105.0,39.7")
    // Only the city goes to /counts; the state is counted from the region counts.
    const counts = calls.find((u) => u.pathname === "/api/locations/counts")!
    expect(counts.searchParams.get("points")).toBe("-104.9849,39.7392")
    expect(counts.searchParams.get("r")).toBe("10")
  })

  it("counts only the shown kinds", async () => {
    const calls = mockApi({
      "/api/geocode": () => ({ results: [DENVER, COLORADO] }),
      "/api/locations/counts": () => ({ counts: [7] }),
      "/api/locations/aggregates": () => ({
        counts: [
          { country: "US", region: "CO", kind: "vending", count: 60 },
          { country: "US", region: "CO", kind: "shop", count: 3 },
        ],
      }),
    })
    const { result } = renderHook(() => useSearch("Denver", { kinds: ["shop"] }))
    await settle()
    expect(result.current.areas.map((a) => a.count)).toEqual([7, 3])
    expect(calls.find((u) => u.pathname === "/api/locations/counts")!.searchParams.get("types")).toBe("shop")
    // The landing page doesn't search locations.
    expect(calls.some((u) => u.pathname === "/api/locations/search")).toBe(false)
  })

  it("filters by the map's retailers and counts with the radius a pick opens", async () => {
    const calls = mockApi({
      "/api/geocode": () => ({ results: [DENVER, COLORADO] }),
      "/api/locations/search": () => ({ type: "FeatureCollection", features: [] }),
      "/api/locations/counts": () => ({ counts: [4] }),
      "/api/locations/aggregates": () => ({ counts: [{ country: "US", region: "CO", kind: "vending", count: 60 }] }),
    })
    const { result } = renderHook(() => useSearch("Denver", { locations: true, retailers: ["King Soopers"], radius: 25 }))
    await settle()
    const counts = calls.find((u) => u.pathname === "/api/locations/counts")!
    expect(counts.searchParams.get("retailer")).toBe("King Soopers")
    expect(counts.searchParams.get("r")).toBe("25")
    expect(calls.find((u) => u.pathname === "/api/locations/search")!.searchParams.get("retailer")).toBe("King Soopers")
    // The region counts aren't by retailer: a filtered state goes uncounted.
    expect(result.current.areas.map((a) => a.count)).toEqual([4, null])
    expect(calls.some((u) => u.pathname === "/api/locations/aggregates")).toBe(false)
  })

  it("keeps the areas when the locations lookup fails, and skips it for a long query", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const calls = mockApi({
      "/api/geocode": () => ({ results: [DENVER] }),
      "/api/locations/search": () => new Response("{}", { status: 500 }),
      "/api/locations/counts": () => ({ counts: [50] }),
    })
    const { result, rerender } = renderHook(({ q }) => useSearch(q, { locations: true }), { initialProps: { q: "Denver" } })
    await settle()
    expect(result.current.status).toBe("ready")
    expect(result.current.areas.map((a) => a.label)).toEqual(["Denver, CO"])
    expect(result.current.locations).toEqual([])
    const long = "1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500, United States of America, Earth"
    rerender({ q: long })
    await settle()
    expect(result.current.status).toBe("ready")
    expect(calls.filter((u) => u.pathname === "/api/locations/search").map((u) => u.searchParams.get("q"))).toEqual(["Denver"])
  })

  it("sends only the last query when typing fast", async () => {
    const calls = mockApi({ "/api/geocode": (u) => ({ results: [{ ...DENVER, label: u.searchParams.get("q") }] }), "/api/locations/counts": () => ({ counts: [1] }) })
    const { result, rerender } = renderHook(({ q }) => useSearch(q), { initialProps: { q: "De" } })
    rerender({ q: "Den" })
    rerender({ q: "Denv" })
    await settle()
    expect(calls.filter((u) => u.pathname === "/api/geocode").map((u) => u.searchParams.get("q"))).toEqual(["Denv"])
    expect(result.current.query).toBe("Denv")
  })

  it("keeps the areas when counting fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {})
    mockApi({ "/api/geocode": () => ({ results: [DENVER] }), "/api/locations/counts": () => new Response("{}", { status: 500 }) })
    const { result } = renderHook(() => useSearch("Denver"))
    await settle()
    expect(result.current.status).toBe("ready")
    expect(result.current.areas.map((a) => [a.label, a.count])).toEqual([["Denver, CO", null]])
  })

  it("reports an error when the geocoder fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    mockApi({ "/api/geocode": () => new Response("{}", { status: 502 }) })
    const { result } = renderHook(() => useSearch("Denver"))
    await settle()
    expect(result.current.status).toBe("error")
  })

  it("does nothing below two characters", async () => {
    const calls = mockApi({})
    const { result } = renderHook(() => useSearch(" D "))
    await settle()
    expect(result.current.status).toBe("idle")
    expect(calls).toHaveLength(0)
  })
})
