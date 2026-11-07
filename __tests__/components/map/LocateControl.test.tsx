import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"

const toast = vi.fn()
vi.mock("sonner", () => ({ toast: (...args: unknown[]) => toast(...args) }))

/**
 * Stands in for maplibregl.GeolocateControl. Like MapLibre, each onAdd builds
 * a fresh container, and trigger() returns false until setup has finished.
 */
class FakeGeolocate {
  static last: FakeGeolocate
  listeners = new Map<string, ((e: unknown) => void)[]>()
  _container = document.createElement("div")
  finishes = 0
  ready = false
  triggerImpl: () => boolean = () => this.ready
  constructor(public options: Record<string, unknown>) {
    FakeGeolocate.last = this
  }
  onAdd() {
    this._container = document.createElement("div")
  }
  _finishSetupUI() {
    this.finishes++
    this.ready = true
  }
  on(type: string, fn: (e: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn])
  }
  fire(type: string, e: unknown) {
    this.listeners.get(type)?.forEach((fn) => fn(e))
  }
  trigger() {
    return this.triggerImpl()
  }
}

vi.mock("@/components/map/engine", () => ({
  useControl: (create: (ctx: { mapLib: unknown }) => unknown) => {
    const ref = globalThis as { __ctrl?: unknown }
    ref.__ctrl ??= create({ mapLib: { GeolocateControl: FakeGeolocate } })
    return ref.__ctrl
  },
}))

import { AUTO_LOCATE_TRIES, LOCATE_GIVE_UP_MS, LocateControl, LOCATION_DENIED, LOCATION_UNAVAILABLE } from "@/components/map/LocateControl"

afterEach(() => {
  delete (globalThis as { __ctrl?: unknown }).__ctrl
  toast.mockReset()
  vi.useRealTimers()
})

describe("LocateControl", () => {
  it("locates once per tap, without following the viewer", () => {
    render(<LocateControl onLocate={() => {}} />)
    expect(FakeGeolocate.last.options).toMatchObject({ trackUserLocation: false, showAccuracyCircle: true })
  })

  it("finishes setup only once when re-added (React Strict Mode)", () => {
    render(<LocateControl onLocate={() => {}} />)
    const gc = FakeGeolocate.last
    // onAdd, onRemove, onAdd; then both async setups finish.
    gc.onAdd()
    gc.onAdd()
    gc._finishSetupUI()
    gc._finishSetupUI()
    expect(gc.finishes).toBe(1)
  })

  it("shows 'locating' from the tap until a position arrives, then reports it", () => {
    const onLocate = vi.fn()
    render(<LocateControl onLocate={onLocate} />)
    const gc = FakeGeolocate.last
    gc._finishSetupUI()
    gc.trigger()
    expect(gc._container.dataset.locating).toBe("true")
    gc.fire("geolocate", { coords: { longitude: -122.33, latitude: 47.61 } })
    expect(onLocate).toHaveBeenCalledWith({ lng: -122.33, lat: 47.61 })
    expect(gc._container.dataset.locating).toBeUndefined()
    expect(gc._container.dataset.located).toBe("true")
  })

  it("says location is off when the viewer says no, and reports the failure", () => {
    const onError = vi.fn()
    render(<LocateControl onLocate={() => {}} onError={onError} />)
    const gc = FakeGeolocate.last
    gc._finishSetupUI()
    gc.trigger()
    gc.fire("error", { code: 1 })
    expect(toast).toHaveBeenCalledWith(LOCATION_DENIED.title, { description: LOCATION_DENIED.description })
    expect(onError).toHaveBeenCalled()
    expect(gc._container.dataset.locating).toBeUndefined()
  })

  it("gives up when no answer ever comes (a dismissed prompt in Firefox)", async () => {
    vi.useFakeTimers()
    const onError = vi.fn()
    render(<LocateControl onLocate={() => {}} onError={onError} />)
    const gc = FakeGeolocate.last
    gc._finishSetupUI()
    gc.trigger()
    await vi.advanceTimersByTimeAsync(LOCATE_GIVE_UP_MS)
    expect(gc._container.dataset.locating).toBeUndefined()
    expect(toast).toHaveBeenCalledWith(LOCATION_UNAVAILABLE.title, { description: LOCATION_UNAVAILABLE.description })
    expect(onError).toHaveBeenCalled()
  })

  it("doesn't give up after a position arrived", async () => {
    vi.useFakeTimers()
    render(<LocateControl onLocate={() => {}} />)
    const gc = FakeGeolocate.last
    gc._finishSetupUI()
    gc.trigger()
    gc.fire("geolocate", { coords: { longitude: 0, latitude: 0 } })
    await vi.advanceTimersByTimeAsync(LOCATE_GIVE_UP_MS)
    expect(toast).not.toHaveBeenCalled()
  })

  it("reports a trigger that throws instead of failing silently", () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const onError = vi.fn()
    render(<LocateControl onLocate={() => {}} onError={onError} />)
    const gc = FakeGeolocate.last
    gc.triggerImpl = () => {
      throw new TypeError("Cannot read properties of undefined (reading 'getCurrentPosition')")
    }
    expect(gc.trigger()).toBe(true)
    expect(toast).toHaveBeenCalledWith(LOCATION_UNAVAILABLE.title, { description: LOCATION_UNAVAILABLE.description })
    expect(onError).toHaveBeenCalled()
  })
})

describe("LocateControl autoLocate (near=me links)", () => {
  it("retries until setup has finished, then locates once", async () => {
    vi.useFakeTimers()
    render(<LocateControl onLocate={() => {}} autoLocate />)
    const gc = FakeGeolocate.last
    const spy = vi.spyOn(gc, "triggerImpl")
    await vi.advanceTimersByTimeAsync(300)
    expect(gc._container.dataset.locating).toBeUndefined()
    gc._finishSetupUI()
    await vi.advanceTimersByTimeAsync(100)
    expect(gc._container.dataset.locating).toBe("true")
    const calls = spy.mock.calls.length
    await vi.advanceTimersByTimeAsync(1000)
    expect(spy.mock.calls.length).toBe(calls)
  })

  it("gives up if setup never finishes", async () => {
    vi.useFakeTimers()
    render(<LocateControl onLocate={() => {}} autoLocate />)
    const spy = vi.spyOn(FakeGeolocate.last, "triggerImpl")
    await vi.advanceTimersByTimeAsync(100 * (AUTO_LOCATE_TRIES + 10))
    expect(spy).toHaveBeenCalledTimes(AUTO_LOCATE_TRIES)
  })

  it("stops after a trigger that throws", async () => {
    vi.useFakeTimers()
    vi.spyOn(console, "error").mockImplementation(() => {})
    render(<LocateControl onLocate={() => {}} autoLocate />)
    const gc = FakeGeolocate.last
    const throws = vi.fn(() => {
      throw new Error("no geolocation")
    })
    gc.triggerImpl = throws
    await vi.advanceTimersByTimeAsync(1000)
    expect(throws).toHaveBeenCalledTimes(1)
  })
})
