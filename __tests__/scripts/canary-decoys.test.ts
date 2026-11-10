// @vitest-environment node
import { describe, expect, it } from "vitest"
import { formatMachineId, makeDecoy, unusedMachineNumbers, type Group } from "../../scripts/canary/decoys"

const KIRKLAND: Group = { retailer: "Fred Meyer", city: "Kirkland", state: "WA", lng: -122.1838, lat: 47.7079 }

/** Great-circle distance in km. */
function km(a: { lng: number; lat: number }, b: { lng: number; lat: number }) {
  const rad = Math.PI / 180
  const h =
    Math.sin(((b.lat - a.lat) * rad) / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(((b.lng - a.lng) * rad) / 2) ** 2
  return 2 * 6371 * Math.asin(Math.sqrt(h))
}

describe("canary decoys (#202)", () => {
  it("take machine IDs from the gaps among the real ones, never past the highest", () => {
    expect(unusedMachineNumbers(["Q00002", "Q00005", "Q00007", null, "Q99", "manual-1"])).toEqual([1, 3, 4, 6])
    expect(() => unusedMachineNumbers(["Q00001", "Q00002"])).toThrow(/No unused/)
    expect(() => unusedMachineNumbers([])).toThrow(/No unused/)
    expect(formatMachineId(42)).toBe("Q00042")
    expect(formatMachineId(1795)).toBe("Q01795")
  })

  it("look like a real machine of the group's retailer, 1 to 4 km from its middle", () => {
    for (let i = 0; i < 200; i++) {
      const c = makeDecoy(KIRKLAND, 1234)
      expect(c).toMatchObject({ machineID: "Q01234", retailer: "Fred Meyer", city: "Kirkland", state: "WA" })
      expect(c.address).toMatch(/^\d{3,5} ([NSEW] )?[A-Z][a-z]+ [A-Z][a-z]+$/)
      const d = km(KIRKLAND, c)
      expect(d).toBeGreaterThan(0.99)
      expect(d).toBeLessThan(4.01)
    }
  })

  it("differ from one call to the next (crypto randomness, no seed)", () => {
    const made = new Set(Array.from({ length: 20 }, () => JSON.stringify(makeDecoy(KIRKLAND, 7))))
    expect(made.size).toBeGreaterThan(15)
  })

  it("follow the random numbers they're given", () => {
    // All zeros: the first street, 1 km due north.
    const c = makeDecoy(KIRKLAND, 7, () => 0)
    expect(c).toMatchObject({ machineID: "Q00007", address: "100 N Main St", lng: KIRKLAND.lng })
    expect(c.lat).toBeCloseTo(KIRKLAND.lat + 1 / 111.32, 6)
  })
})
