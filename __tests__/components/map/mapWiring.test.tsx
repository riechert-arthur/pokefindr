import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, renderHook } from "@testing-library/react"
import type { LocationFeature, LocationFeatureCollection } from "@/lib/types/locations"

/** A stand-in for a MapLibre map: records layer listeners and serves a style. */
class FakeMap {
  handlers = new Map<string, (e: unknown) => void>()
  styleListeners = new Set<() => void>()
  layers: { id: string; type: string }[] = []
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
  setStyle(layers: { id: string; type: string }[]) {
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
import { useFirstLabelLayer } from "@/components/map/StateLayers"
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

describe("useFirstLabelLayer", () => {
  it("finds the label layer after every road, and follows style changes", () => {
    fake.layers = [
      { id: "water", type: "fill" },
      { id: "water_name", type: "symbol" },
      { id: "motorway", type: "line" },
      { id: "city", type: "symbol" },
    ]
    const { result } = renderHook(() => useFirstLabelLayer())
    expect(result.current).toBe("city")
    act(() => fake.setStyle([{ id: "land", type: "fill" }, { id: "place", type: "symbol" }]))
    expect(result.current).toBe("place")
  })
})
