import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { useViewportLocations, viewportQuery, VIEWPORT_DEBOUNCE_MS, type ViewportMap } from "@/components/map/useViewportLocations"
import type { LocationFeatureCollection } from "@/lib/types/locations"
import { MAX_BBOX_AREA } from "@/lib/locations/bbox"

/** A map that the test moves by hand. */
class FakeMap implements ViewportMap {
  zoom = 10
  box = { w: -122.5, s: 47.5, e: -122.2, n: 47.7 }
  private listeners = new Set<() => void>()
  getZoom = () => this.zoom
  getBounds = () => ({ getWest: () => this.box.w, getSouth: () => this.box.s, getEast: () => this.box.e, getNorth: () => this.box.n })
  on = (_: "moveend", l: () => void) => this.listeners.add(l)
  off = (_: "moveend", l: () => void) => this.listeners.delete(l)
  /** Pans to a box named by its west edge, then fires moveend. */
  moveTo(w: number, zoom = this.zoom) {
    this.box = { ...this.box, w, e: w + 0.3 }
    this.zoom = zoom
    this.listeners.forEach((l) => l())
  }
}

const fc = (ids: string[]): LocationFeatureCollection => ({
  type: "FeatureCollection",
  features: ids.map((id) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [0, 0] },
    properties: { id, machineID: id, retailer: "", address: "", city: "", state: "", kind: "vending" },
  })),
})

/**
 * fetch that answers each request only when the test says so. With
 * `ignoreAbort`, an aborted request still resolves later (a response that was
 * already on its way), so only the hook's own checks keep it out.
 */
function controllableFetch({ ignoreAbort = false } = {}) {
  const pending: { url: string; signal: AbortSignal; resolve: (body: LocationFeatureCollection) => void }[] = []
  const fetchMock = vi.fn((url: string, init: RequestInit) => {
    return new Promise<Response>((resolve, reject) => {
      const signal = init.signal!
      if (!ignoreAbort) signal.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      pending.push({ url, signal, resolve: (body) => resolve(new Response(JSON.stringify(body))) })
    })
  })
  return { fetchMock, pending }
}

const flush = () => act(async () => {
  await vi.advanceTimersByTimeAsync(0)
})

describe("useViewportLocations", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it("loads the view on mount and again when the map settles", async () => {
    const { fetchMock, pending } = controllableFetch()
    vi.stubGlobal("fetch", fetchMock)
    const map = new FakeMap()
    const { result } = renderHook(() => useViewportLocations(map, { types: ["vending"] }))

    expect(result.current.status).toBe("loading")
    expect(pending[0].url).toBe("/api/locations?bbox=-122.5,47.5,-122.2,47.7&types=vending")
    pending[0].resolve(fc(["a"]))
    await flush()
    expect(result.current).toMatchObject({ status: "ready", features: [expect.objectContaining({ properties: expect.objectContaining({ id: "a" }) })] })

    act(() => map.moveTo(-121))
    // Debounced: nothing until the map has been still for 250 ms.
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await act(() => vi.advanceTimersByTimeAsync(VIEWPORT_DEBOUNCE_MS))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    // The old view's locations stay up while the new one loads.
    expect(result.current).toMatchObject({ status: "loading", features: [expect.anything()] })
  })

  it("never ends on an earlier view's results when panning quickly", async () => {
    // The earlier view's response arrives even though its request was aborted.
    const { fetchMock, pending } = controllableFetch({ ignoreAbort: true })
    vi.stubGlobal("fetch", fetchMock)
    const map = new FakeMap()
    const { result } = renderHook(() => useViewportLocations(map, { types: ["vending"] }))
    pending[0].resolve(fc(["start"]))
    await flush()

    act(() => map.moveTo(-121))
    await act(() => vi.advanceTimersByTimeAsync(VIEWPORT_DEBOUNCE_MS))
    act(() => map.moveTo(-120))
    // The request for -121 is cancelled as soon as the map moves on.
    expect(pending[1].signal.aborted).toBe(true)
    await act(() => vi.advanceTimersByTimeAsync(VIEWPORT_DEBOUNCE_MS))

    pending[2].resolve(fc(["latest"]))
    await flush()
    // A late answer for the earlier view changes nothing.
    pending[1].resolve(fc(["stale"]))
    await flush()
    expect(result.current.features.map((f) => f.properties.id)).toEqual(["latest"])
  })

  it("loads nothing while zoomed out", async () => {
    const { fetchMock, pending } = controllableFetch()
    vi.stubGlobal("fetch", fetchMock)
    const map = new FakeMap()
    const { result } = renderHook(() => useViewportLocations(map, { types: ["vending"] }))
    pending[0].resolve(fc(["a"]))
    await flush()

    act(() => map.moveTo(-121, 4))
    await act(() => vi.advanceTimersByTimeAsync(VIEWPORT_DEBOUNCE_MS))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(result.current).toEqual({ features: [], status: "idle", truncated: false })
  })

  it("refetches when the kinds change, and reports errors", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 500 }))
    vi.stubGlobal("fetch", fetchMock)
    vi.spyOn(console, "error").mockImplementation(() => {})
    const map = new FakeMap()
    const { result, rerender } = renderHook(({ types }) => useViewportLocations(map, { types }), {
      initialProps: { types: ["vending"] as ("vending" | "shop")[] },
    })
    await flush()
    expect(result.current.status).toBe("error")
    rerender({ types: ["vending", "shop"] })
    await flush()
    expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining("types=vending,shop"), expect.anything())
  })
})

describe("viewportQuery", () => {
  it("rounds the box outward to 0.01° and clamps it to the world", () => {
    const map = new FakeMap()
    map.box = { w: -122.456, s: 47.481, e: -122.221, n: 47.739 }
    expect(viewportQuery(map, ["vending", "shop"])).toBe("bbox=-122.46,47.48,-122.22,47.74&types=vending,shop")
    map.box = { w: -180.004, s: 84.5, e: -175, n: 90.004 }
    expect(viewportQuery(map, [])).toBe("bbox=-180,84.5,-175,90&types=")
  })
})

describe("viewportQuery on a huge view", () => {
  it("shrinks a box over the API's limit around its center", () => {
    const map = new FakeMap()
    map.box = { w: -140, s: 10, e: -60, n: 60 } // 4,000 square degrees
    const [w, s, e, n] = viewportQuery(map, ["vending"]).match(/bbox=([^&]+)/)![1].split(",").map(Number)
    expect((e - w) * (n - s)).toBeLessThanOrEqual(MAX_BBOX_AREA)
    expect((w + e) / 2).toBeCloseTo(-100, 0)
    expect((s + n) / 2).toBeCloseTo(35, 0)
  })
})
