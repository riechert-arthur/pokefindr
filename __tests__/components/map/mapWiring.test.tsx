import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, renderHook } from "@testing-library/react"
import type { LocationFeature, LocationFeatureCollection } from "@/lib/types/locations"

/** A stand-in for a MapLibre map: records layer listeners and serves a style. */
class FakeMap {
  handlers = new Map<string, (e: unknown) => void>()
  styleListeners = new Set<() => void>()
  layers: { id: string; type: string; "source-layer"?: string }[] = []
  canvas = { style: { cursor: "" } }
  on(type: string, layerOrFn: string | (() => void), fn?: (e: unknown) => void) {
    if (typeof layerOrFn === "function") this.styleListeners.add(layerOrFn)
    else this.handlers.set(`${type}:${layerOrFn}`, fn!)
  }
  off(type: string, layerOrFn: string | (() => void)) {
    if (typeof layerOrFn === "function") this.styleListeners.delete(layerOrFn)
    else this.handlers.delete(`${type}:${layerOrFn}`)
  }
  getCanvas = () => this.canvas
  getStyle = () => ({ layers: this.layers })
  isStyleLoaded = () => true
  setStyle(layers: { id: string; type: string; "source-layer"?: string }[]) {
    this.layers = layers
    this.styleListeners.forEach((l) => l())
  }
}

let fake = new FakeMap()
vi.mock("@/components/map/engine", () => ({
  useMap: () => ({ current: fake }),
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: () => null,
}))

import { LocationLayers } from "@/components/map/LocationLayers"
import { useBasemapStack } from "@/components/map/BasemapOverlays"
import type { MapColors } from "@/components/map/layers"

const feature = (id: string, lng: number, lat: number): LocationFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lng, lat] },
  properties: { id, machineID: id, retailer: "QFC", address: "", city: "", state: "WA", kind: "vending" },
})

afterEach(() => {
  fake = new FakeMap()
})

describe("LocationLayers", () => {
  it("selects the original feature, not the tile-rounded click geometry", () => {
    const original = feature("a", -122.330861, 47.612934)
    const collection: LocationFeatureCollection = { type: "FeatureCollection", features: [original] }
    const onSelect = vi.fn()
    render(<LocationLayers collection={collection} selected={null} colors={{} as MapColors} onSelect={onSelect} />)
    fake.handlers.get("click:place-dots")!({
      features: [{ geometry: { type: "Point", coordinates: [-122.3309, 47.6129] }, properties: { id: "a" } }],
    })
    expect(onSelect).toHaveBeenCalledWith(original)
  })
})

describe("useBasemapStack", () => {
  it("puts the shading under copies of the basemap's water and borders, and follows style changes", () => {
    fake.layers = [
      { id: "water", type: "fill", "source-layer": "water" },
      { id: "water_name", type: "symbol" },
      { id: "motorway", type: "line", "source-layer": "transportation" },
      { id: "boundary_2", type: "line", "source-layer": "boundary" },
      { id: "city", type: "symbol" },
    ]
    const { result } = renderHook(() => useBasemapStack())
    expect(result.current.labelId).toBe("city")
    expect(result.current.overlays.map((l) => l.id)).toEqual(["pf-overlay-water", "pf-overlay-boundary_2"])
    expect(result.current.shadingBeforeId).toBe("pf-overlay-water")
    act(() => fake.setStyle([{ id: "land", type: "fill" }, { id: "place", type: "symbol" }]))
    expect(result.current).toMatchObject({ labelId: "place", overlays: [], shadingBeforeId: "place" })
  })
})
