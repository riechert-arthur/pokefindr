import { describe, expect, it } from "vitest"
import { citiesQuerySchema, countsQuerySchema, nearQuerySchema, searchQuerySchema } from "@/lib/locations/search"

describe("countsQuerySchema", () => {
  it("parses points, a radius and kinds", () => {
    expect(countsQuerySchema.parse({ points: "-104.98,39.74;-97.13,33.21", r: "10", types: "vending" })).toEqual({
      points: [
        [-104.98, 39.74],
        [-97.13, 33.21],
      ],
      r: 10,
      types: ["vending"],
    })
    expect(countsQuerySchema.parse({ points: "0,0", r: "50" }).types).toEqual(["vending", "shop", "event"])
  })

  it.each([
    ["no points", { points: "", r: "10" }],
    ["a radius the map doesn't offer", { points: "0,0", r: "7" }],
    ["a latitude out of range", { points: "0,91", r: "10" }],
    ["more than 10 points", { points: Array(11).fill("0,0").join(";"), r: "10" }],
    ["an unknown kind", { points: "0,0", r: "10", types: "arcade" }],
  ])("rejects %s", (_, query) => {
    expect(countsQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe("searchQuerySchema", () => {
  it("trims the query and defaults the limit", () => {
    expect(searchQuerySchema.parse({ q: "  kroger " })).toMatchObject({ q: "kroger", limit: 5 })
    expect(searchQuerySchema.parse({ q: "kroger", near: "-104.9,39.7" }).near).toEqual([-104.9, 39.7])
  })

  it.each([
    ["a one-letter query", { q: "k" }],
    ["a limit over 20", { q: "kroger", limit: "50" }],
    ["near in scientific notation", { q: "kroger", near: "1e2,0" }],
  ])("rejects %s", (_, query) => {
    expect(searchQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe("nearQuerySchema", () => {
  it("parses the place, radius, kinds and retailers", () => {
    expect(nearQuerySchema.parse({ lng: "-122.3285", lat: "47.6196", r: "10", retailer: "QFC, Safeway" })).toEqual({
      lng: -122.3285,
      lat: 47.6196,
      r: 10,
      types: ["vending", "shop", "event"],
      retailer: ["QFC", "Safeway"],
    })
  })

  it.each([
    ["no point", { lng: "", lat: "", r: "10" }],
    ["a radius the map doesn't offer", { lng: "0", lat: "0", r: "100" }],
    ["a longitude out of range", { lng: "181", lat: "0", r: "10" }],
  ])("rejects %s", (_, query) => {
    expect(nearQuerySchema.safeParse(query).success).toBe(false)
  })
})

describe("citiesQuerySchema", () => {
  it("takes a state code in any case", () => {
    expect(citiesQuerySchema.parse({ state: "wa" })).toMatchObject({ state: "WA" })
    expect(citiesQuerySchema.safeParse({ state: "ZZ" }).success).toBe(false)
    expect(citiesQuerySchema.safeParse({ state: "" }).success).toBe(false)
  })
})
