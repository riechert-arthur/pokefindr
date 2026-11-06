// @vitest-environment node
import { describe, expect, it } from "vitest"
import { parseFeatures, toLocationRow, type SourceFeature } from "../../scripts/one-off/import-locations"

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

  /** `base` placed at `geometry`, with Mapbox's point at `mapbox` (or none). */
  const at = (geometry: number[], mapbox: [number, number] | null): SourceFeature => ({
    ...base,
    geometry: { type: "Point", coordinates: geometry },
    properties: {
      ...base.properties,
      coordinates: mapbox && { longitude: mapbox[0], latitude: mapbox[1], accuracy: "rooftop" },
    },
  })

  it("swaps a geometry typed as latitude, longitude, with a warning", () => {
    // Q00984 in the JSON: a hand correction typed backwards, near Mapbox's point.
    const result = toLocationRow(at([37.77541, -122.23037], [-122.232689, 37.775203]))
    expect(result).toMatchObject({ row: { lng: -122.23037, lat: 37.77541 }, warning: expect.stringContaining("swapped") })
  })

  it("swaps a latitude, longitude pair even when it is a valid position, because it's outside the US", () => {
    // [40.71, -74.0] is a valid point in Antarctica, typed for New York.
    const result = toLocationRow(at([40.71, -74.0], null))
    expect(result).toMatchObject({ row: { lng: -74.0, lat: 40.71 }, warning: expect.stringContaining("outside the US") })
  })

  it("doesn't trust a swapped geometry far from Mapbox's point", () => {
    // Swapped, [-111.5, 33.4] is in the US, but nowhere near Mapbox's New York point.
    expect(toLocationRow(at([33.4, -111.5], [-74.0, 40.71]))).toMatchObject({
      row: { lng: -74.0, lat: 40.71 },
      warning: "Q00350: geometry [33.4, -111.5] is outside the US; swapped, it's more than 0.1° from properties.coordinates; used properties.coordinates",
    })
  })

  it("swaps Mapbox's point back too when it's the fallback", () => {
    expect(toLocationRow(at([500, 500], [33.4, -111.5]))).toMatchObject({
      row: { lng: -111.5, lat: 33.4 },
      warning: expect.stringContaining("properties.coordinates [33.4, -111.5] are outside the US; used them swapped"),
    })
  })

  it("accepts machines in US territories outside the mainland box", () => {
    for (const [lng, lat] of [
      [144.79, 13.47], // Guam
      [145.75, 15.18], // Saipan
      [173.18, 52.94], // Attu, western Aleutians
      [-170.7, -14.28], // Pago Pago, American Samoa
      [-64.93, 18.34], // St. Thomas, USVI
    ]) {
      expect(toLocationRow(at([lng, lat], [lng, lat]))).toEqual({ row: expect.objectContaining({ lng, lat }), warning: undefined })
    }
  })

  it("takes a numeric machineID as its digits", () => {
    expect(row({ ...base, properties: { ...base.properties, machineID: 350 } }).machineID).toBe("350")
  })

  it("reads the manual override flag", () => {
    expect(row({ ...base, properties: { ...base.properties, _manual_override: true } }).manual_override).toBe(true)
    expect(row(base).raw).not.toHaveProperty("_manual_override")
  })

  it("falls back to Mapbox's coordinates when the geometry is unusable even swapped", () => {
    expect(toLocationRow({ ...base, geometry: { coordinates: [500, 500] } })).toMatchObject({
      row: { lng: -111.5, lat: 33.4 },
      warning: "Q00350: geometry [500, 500] is outside the US; used properties.coordinates",
    })
  })

  it("skips features without a machineID or any usable coordinates", () => {
    expect(toLocationRow({ ...base, properties: { ...base.properties, machineID: " " } })).toEqual({ skip: "no machineID" })
    const nowhere = { ...base, properties: { ...base.properties, coordinates: { longitude: 500, latitude: 500 } } }
    expect(toLocationRow({ ...nowhere, geometry: { coordinates: [500, 500] } })).toEqual({
      skip: "Q00350: geometry [500, 500] is outside the US; properties.coordinates [500, 500] are outside the US",
    })
  })

  it("says the geometry was unusable when there's no fallback, instead of 'no coordinates'", () => {
    const noFallback = { ...base, geometry: { coordinates: [500, 500] }, properties: { ...base.properties, coordinates: null } }
    expect(toLocationRow(noFallback)).toEqual({
      skip: "Q00350: geometry [500, 500] is outside the US; no properties.coordinates",
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
