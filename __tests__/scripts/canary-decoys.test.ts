// @vitest-environment node
import { describe, expect, it } from "vitest"
import { generateCanaries, MAX_CANARIES } from "../../scripts/canary/decoys"

const SEED = "a-test-seed-that-is-long-enough"

describe("generateCanaries (#202)", () => {
  it("makes the same decoys from the same seed, and others from another", () => {
    expect(generateCanaries(SEED, 6)).toEqual(generateCanaries(SEED, 6))
    expect(generateCanaries(SEED, 6)).not.toEqual(generateCanaries(`${SEED}!`, 6))
    // A larger count adds to the list; it doesn't change the first ones.
    expect(generateCanaries(SEED, 8).slice(0, 6)).toEqual(generateCanaries(SEED, 6))
  })

  it("gives each decoy its own machine ID and town, looking like a real machine", () => {
    const canaries = generateCanaries(SEED, MAX_CANARIES)
    expect(new Set(canaries.map((c) => c.machineID)).size).toBe(MAX_CANARIES)
    expect(new Set(canaries.map((c) => `${c.city}, ${c.state}`)).size).toBe(MAX_CANARIES)
    for (const c of canaries) {
      expect(c.machineID).toMatch(/^Q0[34]\d{3}$/)
      expect(c.address).toMatch(/^\d{3,4} ([NSEW] )?[A-Z][a-z]+ [A-Z][a-z]+$/)
      expect(c.state).toMatch(/^[A-Z]{2}$/)
      expect(c.lng).toBeGreaterThan(-125)
      expect(c.lng).toBeLessThan(-66)
      expect(c.lat).toBeGreaterThan(24)
      expect(c.lat).toBeLessThan(50)
    }
  })

  it("refuses a short seed or a count out of range", () => {
    expect(() => generateCanaries("short", 3)).toThrow(/at least 16/)
    expect(() => generateCanaries(SEED, 0)).toThrow(/count/)
    expect(() => generateCanaries(SEED, MAX_CANARIES + 1)).toThrow(/count/)
  })
})
