import { describe, expect, it } from "vitest"
import type { Geocoder } from "@/server/ports/geocoder"

/**
 * What every geocoder must do, run against `fake` always and against a real
 * provider when its key is set (see geocoder.test.ts).
 */
export function geocoderContract(name: string, make: () => Geocoder, { timeout = 5000 } = {}) {
  describe(`${name} geocoder (contract)`, () => {
    it("finds a well-known city, labelled with its state", { timeout }, async () => {
      const [first] = await make().search("Seattle, WA", { limit: 1 })
      expect(first.kind).toBe("city")
      expect(first.label).toBe("Seattle, WA")
      expect(first.state).toBe("WA")
      expect(first.lat).toBeCloseTo(47.6, 0)
      expect(first.lng).toBeCloseTo(-122.3, 0)
    })

    it("finds a ZIP code", { timeout }, async () => {
      const results = await make().search("98101", { limit: 3 })
      const zip = results.find((r) => r.kind === "postcode")
      expect(zip?.lat).toBeCloseTo(47.6, 0)
    })

    it("finds a street address", { timeout }, async () => {
      const results = await make().search("1600 Pennsylvania Ave NW, Washington, DC", { limit: 3 })
      const address = results.find((r) => r.kind === "address")
      expect(address?.lat).toBeCloseTo(38.9, 0)
      expect(address?.lng).toBeCloseTo(-77.04, 1)
    })

    it("returns at most `limit` results", { timeout }, async () => {
      expect((await make().search("Den", { limit: 2 })).length).toBeLessThanOrEqual(2)
    })

    it("returns nothing for nonsense", { timeout }, async () => {
      expect(await make().search("qqzxqqzxqqzx")).toEqual([])
    })
  })
}
