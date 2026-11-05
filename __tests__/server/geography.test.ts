// @vitest-environment node
import { describe, it, expect } from "vitest"
import { parsePointWkb } from "@/server/db/geography"

describe("parsePointWkb", () => {
  it("decodes little-endian EWKB with SRID (what PostGIS returns)", () => {
    // SELECT ST_SetSRID(ST_MakePoint(-111.544047, 33.413887), 4326)::geography
    const hex = "0101000020E61000002A1F82AAD1E25BC0AA9ECC3FFAB44040"
    expect(parsePointWkb(hex)).toEqual({ lng: -111.544047, lat: 33.413887 })
  })

  it("decodes plain big-endian WKB", () => {
    // POINT(1 2), XDR
    const hex = "00000000013FF00000000000004000000000000000"
    expect(parsePointWkb(hex)).toEqual({ lng: 1, lat: 2 })
  })

  it("rejects POINT EMPTY instead of returning NaN", () => {
    // SELECT 'SRID=4326;POINT EMPTY'::geography
    expect(() => parsePointWkb("0101000020E6100000000000000000F87F000000000000F87F")).toThrow("WKB Point is empty")
  })

  it("rejects truncated or non-hex input with a clear error", () => {
    expect(() => parsePointWkb("0101000020E6100000")).toThrow("WKB Point is too short")
    expect(() => parsePointWkb("01")).toThrow("WKB Point is too short")
    expect(() => parsePointWkb("not hex")).toThrow("hex-encoded")
  })

  it("rejects non-point geometries", () => {
    // LINESTRING EMPTY
    expect(() => parsePointWkb("010200000000000000")).toThrow(/Point/)
  })
})
