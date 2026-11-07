import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const toast = vi.fn()
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }))

/** Stands in for maplibregl.GeolocateControl: records listeners and how often setup ran. */
class FakeGeolocate {
  static last: FakeGeolocate
  listeners = new Map<string, ((e: unknown) => void)[]>()
  _container = document.createElement("div")
  setups = 0
  finishes = 0
  triggered = 0
  constructor(public options: Record<string, unknown>) {
    FakeGeolocate.last = this
  }
  _setupUI() {
    this.setups++
    this._container.append(document.createElement("button"))
  }
  _finishSetupUI() {
    this.finishes++
  }
  on(type: string, fn: (e: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  fire(type: string, e: unknown) {
    this.listeners.get(type)?.forEach((fn) => fn(e))
  }
  trigger() {
    this.triggered++
    return true
  }
}

vi.mock("@/components/map/engine", () => ({
  useControl: (create: (ctx: { mapLib: unknown }) => unknown) => {
    // Like react-maplibre: create once per mount.
    const ref = (globalThis as { __ctrl?: unknown })
    ref.__ctrl ??= create({ mapLib: { GeolocateControl: FakeGeolocate } })
    return ref.__ctrl
  },
}))

import { LocateControl, LOCATION_DENIED } from "@/components/map/LocateControl"

afterEach(() => {
  delete (globalThis as { __ctrl?: unknown }).__ctrl
  toast.mockReset()
})

describe("LocateControl", () => {
  it("locates once per tap, without following the viewer", () => {
    render(<LocateControl onLocate={() => {}} />)
    expect(FakeGeolocate.last.options).toMatchObject({ trackUserLocation: false, showAccuracyCircle: true })
  })

  it("builds the button and finishes setup only once when re-added (React Strict Mode)", () => {
    render(<LocateControl onLocate={() => {}} />)
    const gc = FakeGeolocate.last
    // onAdd, onRemove, onAdd: two setups, then both async finishes.
    gc._setupUI()
    gc._setupUI()
    gc._finishSetupUI()
    gc._finishSetupUI()
    expect(gc.setups).toBe(1)
    expect(gc.finishes).toBe(1)
  })

  it("reports each position and marks the button as found", () => {
    const onLocate = vi.fn()
    render(<LocateControl onLocate={onLocate} />)
    FakeGeolocate.last.fire("geolocate", { coords: { longitude: -122.33, latitude: 47.61 } })
    expect(onLocate).toHaveBeenCalledWith({ lng: -122.33, lat: 47.61 })
    expect(FakeGeolocate.last._container.dataset.located).toBe("true")
  })

  it("says location is off when the viewer says no", () => {
    render(<LocateControl onLocate={() => {}} />)
    FakeGeolocate.last.fire("error", { code: 1 })
    expect(toast).toHaveBeenCalledWith(LOCATION_DENIED.title, { description: LOCATION_DENIED.description })
    expect(FakeGeolocate.last._container.dataset.located).toBeUndefined()
  })

  it("asks right away for a shared near=me link", async () => {
    vi.useFakeTimers()
    render(<LocateControl onLocate={() => {}} autoLocate />)
    await vi.advanceTimersByTimeAsync(100)
    expect(FakeGeolocate.last.triggered).toBe(1)
    vi.useRealTimers()
  })
})
