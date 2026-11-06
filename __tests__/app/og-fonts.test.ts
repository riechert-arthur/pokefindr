// @vitest-environment node
import { describe, expect, it } from "vitest"
import { OG_WEIGHTS, ogFonts } from "@/app/og-fonts"

describe("og-fonts", () => {
  it("loads every bundled weight from disk as a TrueType font", async () => {
    const fonts = await ogFonts()
    expect(fonts.map((f) => f.weight)).toEqual([...OG_WEIGHTS])
    for (const font of fonts) {
      // TrueType files start with 0x00010000.
      expect(font.data.readUInt32BE(0), `weight ${font.weight}`).toBe(0x00010000)
      expect(font.data.length).toBeGreaterThan(10_000)
    }
  })
})
