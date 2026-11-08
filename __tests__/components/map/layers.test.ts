import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import type { Polygon } from "geojson"
import { basemapOverlays, countryAtPoint, OVERLAY_PREFIX, placeDotsLayer, shadingBeforeId, statesFillLayer, POINT_ZOOM, type MapColors } from "@/components/map/layers"
import type { LayerSpecification } from "@/components/map/engine"
import { shadeStates, type StateCollection } from "@/components/map/useStateShading"
import { boundsOf, worldWithHoles } from "@/lib/map/geo"
import { mixColors } from "@/lib/design/tokens"
import type { RegionCount } from "@/lib/types/locations"

const colors: MapColors = {
  "kind-vending": "hsl(11, 89%, 47%)",
  "kind-shop": "hsl(174, 82%, 32%)",
  "kind-event": "hsl(32, 95%, 44%)",
  "map-dot-ring": "hsl(0, 0%, 100%)",
  primary: "hsl(240, 6%, 10%)",
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

describe("shadingBeforeId", () => {
  // Layer ids and types of the OpenFreeMap styles in engine.ts, saved from the live styles.
  const positron = JSON.parse(readFileSync(path.join(__dirname, "fixtures/openfreemap-positron-layers.json"), "utf8"))
  const dark = JSON.parse(readFileSync(path.join(__dirname, "fixtures/openfreemap-dark-layers.json"), "utf8"))

  it.each([["positron", positron], ["dark", dark]])("puts every road under the shading in %s", (_, layers: { id: string; type: string }[]) => {
    const before = shadingBeforeId(layers)
    const at = layers.findIndex((l) => l.id === before)
    expect(at).toBeGreaterThan(0)
    expect(layers.slice(at).filter((l) => l.type !== "symbol")).toEqual([])
  })

  it("ignores our own layers and handles styles without labels", () => {
    const layers = [
      { id: "land", type: "fill" },
      { id: "water_name", type: "symbol" },
      { id: "motorway", type: "line" },
      { id: "city", type: "symbol" },
      { id: "states-fill", type: "fill" },
    ]
    expect(shadingBeforeId(layers)).toBe("city")
    expect(shadingBeforeId([{ id: "land", type: "fill" }])).toBeUndefined()
  })
})

describe("worldWithHoles", () => {
  const ccw = (ring: number[][]) => {
    let a = 0
    for (let i = 0; i < ring.length - 1; i++) a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1]
    return a > 0
  }

  it("covers the world with a hole per cut-out polygon, wound opposite the outer ring", () => {
    const usa = square(-124, 25, -67, 49)
    const alaska = { type: "MultiPolygon" as const, coordinates: [square(-170, 52, -130, 71).coordinates, [[...square(-160, 55, -159, 56).coordinates[0]].reverse()]] }
    const mask = worldWithHoles([usa, alaska])
    const [outer, ...holes] = mask.geometry.coordinates
    expect(ccw(outer)).toBe(true)
    expect(holes).toHaveLength(3)
    for (const hole of holes) expect(ccw(hole)).toBe(false)
  })
})

describe("basemapOverlays", () => {
  it("copies the basemap's water and border layers, renamed", () => {
    const layers = [
      { id: "background", type: "background" },
      { id: "water", type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#abc" } },
      { id: "road", type: "line", source: "openmaptiles", "source-layer": "transportation" },
      { id: "boundary_2", type: "line", source: "openmaptiles", "source-layer": "boundary", minzoom: 2 },
      { id: `${OVERLAY_PREFIX}water`, type: "fill", source: "openmaptiles", "source-layer": "water" },
    ] as unknown as LayerSpecification[]
    expect(basemapOverlays(layers)).toEqual([
      { id: `${OVERLAY_PREFIX}water`, type: "fill", source: "openmaptiles", "source-layer": "water", paint: { "fill-color": "#abc" } },
      { id: `${OVERLAY_PREFIX}boundary_2`, type: "line", source: "openmaptiles", "source-layer": "boundary", minzoom: 2 },
    ])
  })

  it("aren't mistaken for basemap layers when placing the shading", () => {
    const layers = [
      { id: "water", type: "fill" },
      { id: "city", type: "symbol" },
      { id: `${OVERLAY_PREFIX}water`, type: "fill" },
    ]
    expect(shadingBeforeId(layers)).toBe("city")
  })
})

describe("basemapOverlays on the real basemaps", () => {
  const read = (name: string) =>
    JSON.parse(readFileSync(path.join(__dirname, `fixtures/openfreemap-${name}-layers.json`), "utf8")) as LayerSpecification[]

  it.each(["positron", "dark"])("copies %s's water and country borders, which then sit under its labels", (name) => {
    const layers = read(name)
    const overlays = basemapOverlays(layers)
    expect(overlays.some((l) => l.type === "fill" && (l as { "source-layer"?: string })["source-layer"] === "water")).toBe(true)
    expect(overlays.some((l) => l.type === "line" && (l as { "source-layer"?: string })["source-layer"] === "boundary")).toBe(true)
    // With the copies added, the shading still goes under the same label layer.
    expect(shadingBeforeId([...layers, ...overlays])).toBe(shadingBeforeId(layers))
  })
})

describe("countryAtPoint", () => {
  const water = new Set([`${OVERLAY_PREFIX}water`])
  const f = (layer: string, id?: number, name?: string) => ({ layer: { id: layer }, id, properties: name ? { name } : {} })

  it("names the country under the pointer", () => {
    expect(countryAtPoint([f("world-hit", 7, "Canada"), f("world-fill")], water)).toEqual({ kind: "country", id: 7, name: "Canada" })
  })

  it("stays quiet over the US and over water, where the rough outlines spill", () => {
    expect(countryAtPoint([f("supported-hit"), f("world-hit", 7, "Canada")], water)).toEqual({ kind: "none" })
    expect(countryAtPoint([f(`${OVERLAY_PREFIX}water`), f("world-hit", 7, "Canada")], water)).toEqual({ kind: "none" })
  })

  it("stays quiet over a location's dot that overhangs the border", () => {
    expect(countryAtPoint([f("place-dots"), f("world-hit", 7, "Mexico"), f("world-fill")], water)).toEqual({ kind: "none" })
    expect(countryAtPoint([f("selected-ring"), f("world-fill")], water)).toEqual({ kind: "none" })
  })

  it("still answers over grey the 110m outlines don't cover (Malta)", () => {
    expect(countryAtPoint([f("world-fill")], water)).toEqual({ kind: "unnamed" })
    expect(countryAtPoint([], water)).toEqual({ kind: "none" })
  })
})
