import { describe, expect, it } from "vitest"
import { albers, fitAlbers, scatter } from "@/components/landing/HeroMap"

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

describe("scatter", () => {
  const cells: [number, number, number][] = [
    [-122.5, 47.5, 3],
    [-105, 39.5, 1],
  ]

  it("draws each cell's count of dots inside the cell", () => {
    const dots = scatter(cells, 0.25)
    expect(dots).toHaveLength(4)
    dots.slice(0, 3).forEach(([lng, lat]) => {
      expect(lng).toBeGreaterThanOrEqual(-122.5)
      expect(lng).toBeLessThan(-122.25)
      expect(lat).toBeGreaterThanOrEqual(47.5)
      expect(lat).toBeLessThan(47.75)
    })
    const [lng, lat] = dots[3]
    expect(lng).toBeGreaterThanOrEqual(-105)
    expect(lng).toBeLessThan(-104.75)
    expect(lat).toBeGreaterThanOrEqual(39.5)
    expect(lat).toBeLessThan(39.75)
  })

  it("spreads a cell's dots apart, the same way every time", () => {
    const dots = scatter(cells, 0.25)
    expect(new Set(dots.map(String)).size).toBe(4)
    expect(scatter(cells, 0.25)).toEqual(dots)
  })
})
