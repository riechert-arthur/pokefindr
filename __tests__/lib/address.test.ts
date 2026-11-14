import { describe, expect, it } from "vitest"
import { addressLine, MACHINE_ID, normalizeAddress, normalizeMachineId, placeLine } from "@/lib/locations/address"

describe("normalizeAddress", () => {
  it("matches the issue's example: suffixes and directions spelled out or not", () => {
    expect(normalizeAddress("12221 120th Avenue Northeast")).toBe("12221 120th ave ne")
    expect(normalizeAddress("12221 120th Ave NE")).toBe("12221 120th ave ne")
    expect(normalizeAddress("12221 120th Ave. N.E.")).toBe("12221 120th ave ne")
  })

  it("lowercases, drops punctuation and extra spaces", () => {
    expect(normalizeAddress("  1450   GRANT ST., Suite #2 ")).toBe("1450 grant st ste 2")
    expect(normalizeAddress("100 N Main Street")).toBe(normalizeAddress("100 North Main St"))
    expect(normalizeAddress("5105 Leary Boulevard Northwest")).toBe("5105 leary blvd nw")
  })

  it("only replaces whole words", () => {
    // "Eastgate" isn't "E gate", "Courtland" isn't "Ct land".
    expect(normalizeAddress("10 Eastgate Courtland Rd")).toBe("10 eastgate courtland rd")
  })

  it("is null for nothing", () => {
    expect(normalizeAddress("")).toBeNull()
    expect(normalizeAddress(" ., ")).toBeNull()
    expect(normalizeAddress(null)).toBeNull()
  })
})

describe("machine IDs", () => {
  it("are Q and five digits, whatever the case or spaces", () => {
    expect(normalizeMachineId(" q00245 ")).toBe("Q00245")
    expect(MACHINE_ID.test("Q00245")).toBe(true)
    expect(MACHINE_ID.test("Q0245")).toBe(false)
    expect(MACHINE_ID.test("00245")).toBe(false)
  })
})

describe("placeLine and addressLine", () => {
  it("joins the parts that are known", () => {
    expect(placeLine("Seattle", "WA")).toBe("Seattle, WA")
    expect(placeLine("Seattle", null)).toBe("Seattle")
    expect(placeLine(null, "WA")).toBe("WA")
    expect(placeLine("", undefined)).toBe("")
  })

  it("puts the street address in front", () => {
    expect(addressLine({ address: "1820 SE Hawthorne Blvd", city: "Portland", state: "OR" })).toBe("1820 SE Hawthorne Blvd, Portland, OR")
    expect(addressLine({ address: "1820 SE Hawthorne Blvd", city: null, state: "OR" })).toBe("1820 SE Hawthorne Blvd, OR")
    expect(addressLine({ address: null, city: "Portland", state: "OR" })).toBe("Portland, OR")
    expect(addressLine({ address: "1820 SE Hawthorne Blvd" })).toBe("1820 SE Hawthorne Blvd")
    expect(addressLine({})).toBe("")
  })
})
