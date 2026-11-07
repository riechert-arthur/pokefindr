import { describe, expect, it } from "vitest"
import { albers, fitAlbers } from "@/components/landing/HeroMap"

describe("fitAlbers", () => {
  // As in the prototype, the far northwest can tuck a little under the top
  // edge (parallels curve up away from the central meridian), behind the nav.
  it("fits the lower 48 across the box, west to east and north to south", () => {
    for (const [w, h] of [[1280, 800], [390, 844]]) {
      const project = fitAlbers(w, h)
      const corners = [
        [-124.5, 48.5], // Washington coast
        [-67, 45], // Maine
        [-81, 25.5], // Florida
        [-117, 32.5], // San Diego
      ].map(([lng, lat]) => project(lng, lat))
      for (const [x, y] of corners) {
        expect(x).toBeGreaterThanOrEqual(0)
        expect(x).toBeLessThanOrEqual(w)
        expect(y).toBeGreaterThanOrEqual(-0.05 * h)
        expect(y).toBeLessThanOrEqual(h)
      }
      const [sea, me, fl] = corners
      expect(sea[0]).toBeLessThan(me[0])
      expect(sea[1]).toBeLessThan(fl[1])
    }
  })

  it("is the standard conic: the central meridian is vertical", () => {
    const [x1] = albers(-96, 30)
    const [x2] = albers(-96, 45)
    expect(x1).toBeCloseTo(x2, 10)
  })
})
