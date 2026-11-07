import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { SUPPORTED_COUNTRIES, SUPPORTED_COUNTRY_NUMERIC } from "@/lib/map/countries"
import { worldLayers, type MapColors } from "@/components/map/layers"

const outlines = JSON.parse(readFileSync(path.join(__dirname, "../../public/geo/countries-110m.json"), "utf8")) as {
  features: { properties: { name: string; iso: string } }[]
}

describe("supported countries", () => {
  it("each have an outline, so the map can leave them out of the grey", () => {
    const isos = new Set(outlines.features.map((f) => f.properties.iso))
    expect(SUPPORTED_COUNTRY_NUMERIC.filter((n) => !isos.has(n))).toEqual([])
  })

  it("use the codes locations store", () => {
    for (const c of SUPPORTED_COUNTRIES) expect(c.alpha2).toMatch(/^[A-Z]{2}$/)
  })

  it("are left out of the hover and hit layers, and cut out of the grey", () => {
    const layers = worldLayers({} as MapColors) as unknown as Record<string, { filter?: unknown; source: string }>
    for (const key of ["hit", "hover"]) {
      expect(layers[key].filter).toEqual(["!", ["in", ["get", "iso"], ["literal", ["840"]]]])
    }
    // The grey itself is the world minus the supported outlines (worldWithHoles), unfiltered.
    expect(layers.fill.filter).toBeUndefined()
    expect(layers.fill.source).toBe("unsupported")
  })

  it("each have a detailed outline file", () => {
    for (const c of SUPPORTED_COUNTRIES) {
      const file = path.join(__dirname, "../../public", c.outline)
      const fc = JSON.parse(readFileSync(file, "utf8")) as { features: { geometry: { type: string } }[] }
      expect(fc.features.length, c.outline).toBeGreaterThan(0)
      expect(["Polygon", "MultiPolygon"]).toContain(fc.features[0].geometry.type)
    }
  })

  it("leave Canada and Mexico grey", () => {
    const grey = outlines.features.filter((f) => !SUPPORTED_COUNTRY_NUMERIC.includes(f.properties.iso)).map((f) => f.properties.name)
    expect(grey).toEqual(expect.arrayContaining(["Canada", "Mexico"]))
    expect(grey).not.toContain("United States of America")
  })
})

describe("country outlines", () => {
  // A ring that jumps across the antimeridian twice is drawn the long way
  // round, as a band across the whole map (Fiji and Russia did). One jump is
  // a ring around a pole (Antarctica), which draws correctly.
  it("never cross the antimeridian and come back", () => {
    const crossing = outlines.features.filter((f) => {
      const geometry = (f as unknown as { geometry: { type: string; coordinates: number[][][] | number[][][][] } }).geometry
      const polygons = (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates) as number[][][][]
      return polygons.some((rings) =>
        rings.some((ring) => {
          const jumps = ring.slice(1).filter((p, i) => Math.abs(p[0] - ring[i][0]) > 180).length
          return jumps > 0 && jumps % 2 === 0
        }),
      )
    })
    expect(crossing.map((f) => f.properties.name)).toEqual([])
  })
})
