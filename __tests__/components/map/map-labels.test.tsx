import { describe, expect, it } from "vitest"
import { renderHook } from "../../helpers/intl"
import { localizedTextField, nameLabelIds } from "@/components/map/layers"
import { useStateName } from "@/components/map/useStateName"
import { countryName } from "@/lib/map/country-names"

/** Label layers as OpenFreeMap's positron style has them. */
const NAME = ["case", ["has", "name:nonlatin"], ["concat", ["get", "name:latin"], "\n", ["get", "name:nonlatin"]], ["coalesce", ["get", "name_en"], ["get", "name"]]]
const STYLE = [
  { id: "background", type: "background" },
  { id: "water", type: "fill" },
  { id: "highway-name-major", type: "symbol", layout: { "text-field": NAME } },
  { id: "road_shield_us", type: "symbol", layout: { "text-field": ["to-string", ["get", "ref"]] } },
  { id: "label_country_1", type: "symbol", layout: { "text-field": NAME } },
  { id: "label_state", type: "symbol", layout: { "text-field": "{name}" } },
  { id: "our-labels", type: "symbol", layout: { "text-field": ["get", "name"] } },
]

describe("map labels in the viewer's language (#184)", () => {
  it("rewrites the basemap's name labels, not road numbers or our own layers", () => {
    expect(nameLabelIds(STYLE, new Set([STYLE[6].id]))).toEqual(["highway-name-major", "label_country_1", "label_state"])
  })

  it("prefers the language's name, then the Latin one, then the local one", () => {
    expect(localizedTextField("es")).toEqual(["coalesce", ["get", "name:es"], ["get", "name:latin"], ["get", "name"]])
  })

  it("names the greyed-out countries in the page's language", () => {
    expect(countryName("484", "Mexico", "es")).toBe("México")
    expect(countryName("124", "Canada", "es")).toBe("Canadá")
    expect(countryName("840", "United States of America", "es")).toBe("Estados Unidos")
    expect(countryName("643", "Russia", "en")).toBe("Russia")
    expect(countryName("158", "Taiwan", "es")).toBe("Taiwán")
    // No code in the outlines: Kosovo by its name, the others in English.
    expect(countryName("", "Kosovo", "es")).toBe("Kosovo")
    expect(countryName("", "Kosovo", "ja")).not.toBe("Kosovo")
    expect(countryName("", "Somaliland", "es")).toBe("Somaliland")
  })

  it("names US states in the page's language", () => {
    const { result } = renderHook(() => useStateName(), { locale: "es" })
    expect(result.current("NY")).toBe("Nueva York")
    expect(result.current("WA")).toBe("Washington")
    expect(renderHook(() => useStateName()).result.current("NM")).toBe("New Mexico")
  })
})
