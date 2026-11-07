import { describe, expect, it } from "vitest"
import type { Polygon } from "geojson"
import { placeDotsLayer, statesFillLayer, POINT_ZOOM, type MapColors } from "@/components/map/layers"
import { shadeStates, type StateCollection } from "@/components/map/useStateShading"
import { boundsOf } from "@/lib/map/geo"
import { mixColors } from "@/lib/design/tokens"
import type { RegionCount } from "@/lib/types/locations"

const colors: MapColors = {
  "kind-vending": "hsl(11, 89%, 47%)",
  "kind-shop": "hsl(174, 82%, 32%)",
  "kind-event": "hsl(32, 95%, 44%)",
  "map-dot-ring": "hsl(0, 0%, 100%)",
  foreground: "hsl(0, 0%, 4%)",
  "map-land": "hsl(0, 0%, 100%)",
  "map-line": "hsl(220, 11%, 79%)",
  "map-choro-hi": "hsl(0, 0%, 0%)",
  "map-radius": "hsl(221, 83%, 53%)",
  "map-unsupported": "hsl(60, 6%, 90%)",
  "map-unsupported-line": "hsl(60, 4%, 82%)",
}

/** The parts of a style layer these tests read (LayerProps also covers custom layers, which have none). */
type StyleLayer = { minzoom?: number; maxzoom?: number; paint: Record<string, unknown> }

const square = (w: number, s: number, e: number, n: number): Polygon => ({
  type: "Polygon",
  coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]],
})

describe("map layers", () => {
  it("color each kind with its token and start at POINT_ZOOM", () => {
    const layer = placeDotsLayer(colors) as StyleLayer
    expect(layer.minzoom).toBe(POINT_ZOOM)
    expect(layer.paint["circle-color"]).toEqual([
      "match", ["get", "kind"],
      "vending", colors["kind-vending"], "shop", colors["kind-shop"], "event", colors["kind-event"],
      colors["kind-vending"],
    ])
  })

  it("shade states only while zoomed out, scaled to the busiest state", () => {
    const layer = statesFillLayer(colors, 100) as StyleLayer
    expect(layer.maxzoom).toBe(POINT_ZOOM)
    const [, , none, scale] = layer.paint["fill-color"] as [string, unknown, string, unknown[]]
    expect(none).toBe(colors["map-land"])
    expect(scale.slice(-2)).toEqual([10, colors["map-choro-hi"]])
  })
})

describe("mixColors", () => {
  it("mixes two hsl colors in sRGB", () => {
    expect(mixColors("hsl(0, 0%, 100%)", "hsl(0, 0%, 0%)", 0.5)).toBe("rgb(128, 128, 128)")
    expect(mixColors("hsl(0, 100%, 50%)", "hsl(240, 100%, 50%)", 0)).toBe("rgb(255, 0, 0)")
    expect(mixColors("hsl(0, 100%, 50%)", "hsl(240, 100%, 50%)", 1)).toBe("rgb(0, 0, 255)")
  })

  it("returns the first color when either can't be read", () => {
    expect(mixColors("hsl(0, 0%, 50%)", "red", 0.5)).toBe("hsl(0, 0%, 50%)")
  })
})

describe("shadeStates", () => {
  const outlines: StateCollection = {
    type: "FeatureCollection",
    features: [
      { type: "Feature", properties: { name: "Washington", region: "WA", count: 0 }, geometry: square(-124, 45, -117, 49) },
      { type: "Feature", properties: { name: "Arizona", region: "AZ", count: 0 }, geometry: square(-114, 31, -109, 37) },
      { type: "Feature", properties: { name: "Utah", region: "UT", count: 0 }, geometry: square(-114, 37, -109, 42) },
    ],
  }
  const counts: RegionCount[] = [
    { country: "US", region: "WA", kind: "vending", count: 5 },
    { country: "US", region: "WA", kind: "shop", count: 2 },
    { country: "US", region: "AZ", kind: "vending", count: 3 },
    { country: "CA", region: "WA", kind: "vending", count: 99 },
  ]

  it("sums the shown kinds per US state", () => {
    const { states, max } = shadeStates(outlines, counts, new Set(["vending", "shop", "event"]))
    expect(states.features.map((f) => [f.properties.region, f.properties.count])).toEqual([["WA", 7], ["AZ", 3], ["UT", 0]])
    expect(max).toBe(7)
  })

  it("leaves out hidden kinds, and keeps max at least 1", () => {
    expect(shadeStates(outlines, counts, new Set(["shop"])).max).toBe(2)
    expect(shadeStates(outlines, counts, new Set()).max).toBe(1)
  })
})

describe("boundsOf", () => {
  it("returns a polygon's box", () => {
    expect(boundsOf(square(-124, 45, -117, 49))).toEqual([[-124, 45], [-117, 49]])
  })

  it("keeps a shape across the antimeridian together", () => {
    const alaska = {
      type: "MultiPolygon" as const,
      coordinates: [square(-170, 52, -130, 71).coordinates, square(172, 52, 179, 53).coordinates],
    }
    expect(boundsOf(alaska)).toEqual([[-188, 52], [-130, 71]])
  })
})
