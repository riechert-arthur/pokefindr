import { describe, expect, it } from "vitest"
import { bboxQuerySchema, MAX_BBOX_AREA } from "@/lib/locations/bbox"

const parse = (bbox: string, types?: string) => bboxQuerySchema.safeParse({ bbox, types })

describe("bboxQuerySchema", () => {
  it("parses a box and defaults to every kind", () => {
    expect(parse("-122.46,47.48,-122.22,47.74")).toMatchObject({
      success: true,
      data: { bbox: [-122.46, 47.48, -122.22, 47.74], types: ["vending", "shop", "event"] },
    })
  })

  it("reads types, dropping repeats; an empty value means none", () => {
    expect(parse("0,0,1,1", "shop,shop,event").data?.types).toEqual(["shop", "event"])
    expect(parse("0,0,1,1", "").data?.types).toEqual([])
  })

  it.each([
    ["1,2,3", "three numbers"],
    ["a,0,1,1", "not a number"],
    ["-181,0,1,1", "longitude out of range"],
    ["0,-91,1,1", "latitude out of range"],
    ["5,0,1,1", "west east of east"],
    ["0,5,1,1", "south north of north"],
    ["-180,-80,180,80", "too big"],
    [",0,1,1", "an empty coordinate"],
    ["0x10,0,20,1", "hex"],
    ["1e1,0,20,1", "an exponent"],
    [" 1,0,2,1", "spaces"],
  ])("rejects %s (%s)", (bbox) => {
    expect(parse(bbox).success).toBe(false)
  })

  it("accepts a box right at the area limit", () => {
    expect(parse(`0,0,${MAX_BBOX_AREA / 10},10`).success).toBe(true)
  })

  it("rejects unknown kinds", () => {
    expect(parse("0,0,1,1", "vending,pizza").success).toBe(false)
  })
})
