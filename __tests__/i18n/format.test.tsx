import { afterEach, describe, expect, it, vi } from "vitest"
import { formatFor, render, renderHook, screen } from "../helpers/intl"
import { useDistance } from "@/i18n/useDistance"
import { LocationRow } from "@/components/map/LocationRow"
import type { LocationFeature } from "@/lib/types/locations"

afterEach(() => vi.unstubAllGlobals())

describe("counts and times in each language (#181)", () => {
  const en = formatFor("en")
  const es = formatFor("es")

  it("formats numbers for the language", () => {
    expect(en.count(1457)).toBe("1,457")
    expect(es.count(1457)).toBe("1457")
    expect(es.count(21457)).toBe("21.457")
  })

  it("pluralizes counts in the catalog, with a plus on capped ones", () => {
    expect(en.kindCount("vending", 1)).toBe("1 vending machine")
    expect(en.kindCount("shop", 1457)).toBe("1,457 card shops")
    expect(en.places(2000, ["vending", "shop"], true)).toBe("2,000+ places")
    expect(es.kindCount("vending", 1)).toBe("1 máquina expendedora")
    expect(es.places(12, ["vending", "shop"])).toBe("12 lugares")
    expect(es.places(2000, ["event"], true)).toBe("2000+ eventos")
  })

  it("says how long ago, then the date", () => {
    const now = new Date("2026-11-09T12:00:00Z")
    const before = (s: number) => new Date(now.getTime() - s * 1000).toISOString()
    expect([30, 300, 3 * 3600, 86400, 2 * 86400].map((s) => en.ago(before(s), now))).toEqual(["just now", "5 min ago", "3 hr ago", "1 day ago", "2 days ago"])
    expect([30, 300, 3 * 3600, 86400, 2 * 86400].map((s) => es.ago(before(s), now))).toEqual(["justo ahora", "hace 5 min", "hace 3 h", "hace 1 día", "hace 2 días"])
    expect(en.ago(before(30 * 86400), now)).toBe("Oct 10")
  })
})

describe("useDistance", () => {
  const languages = (tags: string[]) => vi.stubGlobal("navigator", { ...navigator, languages: tags, language: tags[0] })

  it("shows miles to a browser in the US or without a region", () => {
    languages(["en-US", "en"])
    expect(renderHook(() => useDistance()).result.current.distance(0.4)).toBe("0.4 mi")
    languages(["es"])
    expect(renderHook(() => useDistance(), { locale: "es" }).result.current.radius(5)).toBe("5 mi")
  })

  it("shows kilometers to a browser in Mexico, in the page's language", () => {
    languages(["es-MX", "es"])
    const { result } = renderHook(() => useDistance(), { locale: "es" })
    expect(result.current.unit).toBe("km")
    expect(result.current.distance(0.4)).toBe("0,6 km")
    expect(result.current.radius(5)).toBe("8 km")
  })

  it("shows a result's distance in those units", () => {
    languages(["es-MX"])
    const feature = { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { id: "a", kind: "vending", retailer: "Target", city: "Austin", state: "TX" } } as unknown as LocationFeature
    render(<LocationRow feature={feature} distance={1} onOpen={() => {}} />, { locale: "es" })
    expect(screen.getByText("1,6 km")).toBeInTheDocument()
  })
})
