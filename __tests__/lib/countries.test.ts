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

  it("are left out of every grey layer", () => {
    const layers = worldLayers({} as MapColors) as unknown as Record<string, { filter: unknown }>
    for (const layer of Object.values(layers)) {
      expect(layer.filter).toEqual(["!", ["in", ["get", "iso"], ["literal", ["840"]]]])
    }
  })

  it("leave Canada and Mexico grey", () => {
    const grey = outlines.features.filter((f) => !SUPPORTED_COUNTRY_NUMERIC.includes(f.properties.iso)).map((f) => f.properties.name)
    expect(grey).toEqual(expect.arrayContaining(["Canada", "Mexico"]))
    expect(grey).not.toContain("United States of America")
  })
})
