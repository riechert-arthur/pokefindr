// @vitest-environment node
import { describe, expect, it } from "vitest"
import { parseFeatures, toLocationRow, type SourceFeature } from "../../scripts/one-off/import-locations/features"

const base: SourceFeature = {
  type: "Feature",
  geometry: { type: "Point", coordinates: [-111.544047, 33.413887] },
  properties: {
    retailer: "Frys",
    machineID: " Q00350 ",
    address: "150 E Old West Hwy",
    city: "Apache Junction",
    state: "AZ",
    mapbox_id: "dXJuOm1i",
    name: "150 East Old West Highway",
    full_address: "150 East Old West Highway, Apache Junction, Arizona 85119, United States",
    coordinates: { longitude: -111.5, latitude: 33.4, accuracy: "rooftop" },
    match_code: { street: "matched", confidence: "exact", ignored: 3 },
    context: { postcode: { name: "85119" } },
    feature_index: 0,
  },
}

const row = (feature: SourceFeature) => {
  const result = toLocationRow(feature)
  if (!("row" in result)) throw new Error(result.skip)
  return result.row
}

describe("toLocationRow", () => {
  it("maps every field the JSON has", () => {
    expect(row(base)).toEqual({
      machineID: "Q00350",
      retailer: "Frys",
      address: "150 E Old West Hwy",
      city: "Apache Junction",
      state: "AZ",
      postal_code: "85119",
      name: "150 East Old West Highway",
      description: "150 East Old West Highway, Apache Junction, Arizona 85119, United States",
      lng: -111.544047,
      lat: 33.413887,
      mapbox_id: "dXJuOm1i",
      geocode_accuracy: "rooftop",
      match_code: { street: "matched", confidence: "exact" },
      manual_override: false,
      raw: expect.not.objectContaining({ feature_index: expect.anything() }),
    })
  })

  it("prefers the geometry, where hand corrections were written, over Mapbox's coordinates", () => {
    expect(row(base)).toMatchObject({ lng: -111.544047, lat: 33.413887 })
    expect(row({ ...base, geometry: null })).toMatchObject({ lng: -111.5, lat: 33.4 })
  })

  it("swaps a geometry typed as latitude, longitude, with a warning", () => {
    const result = toLocationRow({ ...base, geometry: { type: "Point", coordinates: [37.77541, -122.23037] } })
    expect(result).toMatchObject({ row: { lng: -122.23037, lat: 37.77541 }, warning: expect.stringContaining("swapped") })
  })

  it("reads the manual override flag", () => {
    expect(row({ ...base, properties: { ...base.properties, _manual_override: true } }).manual_override).toBe(true)
    expect(row(base).raw).not.toHaveProperty("_manual_override")
  })

  it("skips features without a machineID or with impossible coordinates", () => {
    expect(toLocationRow({ ...base, properties: { ...base.properties, machineID: " " } })).toEqual({ skip: "no machineID" })
    expect(toLocationRow({ ...base, geometry: { coordinates: [500, 500] } })).toEqual({
      skip: "Q00350: coordinates out of range",
    })
  })
})

describe("parseFeatures", () => {
  const unplaced = { ...base, geometry: null, properties: { ...base.properties, machineID: "Q2", coordinates: null } }

  it("skips machines without coordinates", () => {
    expect(parseFeatures({ features: [base, unplaced] })).toMatchObject({
      rows: [{ machineID: "Q00350" }],
      skipped: ["#1 Q2: no coordinates"],
    })
  })

  it("keeps the first of duplicate machineIDs", () => {
    const second = { ...base, properties: { ...base.properties, retailer: "Second" } }
    const parsed = parseFeatures({ features: [base, second] })
    expect(parsed.rows.map((r) => r.retailer)).toEqual(["Frys"])
    expect(parsed.duplicates).toEqual(["Q00350"])
  })

  it("rejects something that isn't a FeatureCollection", () => {
    expect(() => parseFeatures({} as never)).toThrow(/FeatureCollection/)
  })
})
