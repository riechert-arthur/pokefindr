import { describe, expect, it } from "vitest"
import { distanceUnit, formatDistance, formatRadius } from "@/lib/format/distance"

describe("distances by region (#181)", () => {
  it("uses miles in the US and the UK, and kilometers elsewhere", () => {
    expect(distanceUnit("en-US")).toBe("mi")
    expect(distanceUnit("es-US")).toBe("mi")
    expect(distanceUnit("en-GB")).toBe("mi")
    expect(distanceUnit("es-MX")).toBe("km")
    expect(distanceUnit("fr-CA")).toBe("km")
  })

  it("uses miles without a region (the site's own languages) or a valid tag", () => {
    expect(distanceUnit("en")).toBe("mi")
    expect(distanceUnit("es")).toBe("mi")
    expect(distanceUnit(undefined)).toBe("mi")
    expect(distanceUnit("not a tag")).toBe("mi")
  })

  it("writes a distance in the unit and the language's numbers", () => {
    expect(formatDistance(0.4, "en-US", "mi")).toBe("0.4 mi")
    expect(formatDistance(0.4, "es-US", "mi")).toBe("0.4 mi")
    expect(formatDistance(0.4, "es-MX", "km")).toBe("0.6 km")
    expect(formatDistance(0.4, "es", "km")).toBe("0,6 km")
    expect(formatDistance(12, "en-GB", "mi")).toBe("12.0 mi")
  })

  it("writes radii in whole units, converting the stored miles", () => {
    expect(formatRadius(5, "en-US", "mi")).toBe("5 mi")
    expect(formatRadius(5, "es-MX", "km")).toBe("8 km")
    expect(formatRadius(50, "es-MX", "km")).toBe("80 km")
  })
})
