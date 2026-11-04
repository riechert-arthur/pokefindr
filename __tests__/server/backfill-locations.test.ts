// @vitest-environment node
import { describe, it, expect } from "vitest"
import { toLocationRow } from "../../scripts/db/backfill-locations"

describe("toLocationRow", () => {
  const base = {
    geometry: { coordinates: [-1, -2] as [number, number] },
    properties: {
      machineID: " Q1 ",
      retailer: "Frys",
      address: "150 E Old West Hwy",
      city: "Apache Junction",
      state: "AZ",
      name: "150 East Old West Highway",
      full_address: "150 East Old West Highway, Apache Junction, Arizona 85119, United States",
      coordinates: { longitude: -111.5, latitude: 33.4 },
      context: { postcode: { name: "85119" } },
    },
  }

  it("prefers geocoded coordinates and extracts the postcode", () => {
    expect(toLocationRow(base)).toEqual({
      machineId: "Q1",
      retailer: "Frys",
      address: "150 E Old West Hwy",
      city: "Apache Junction",
      state: "AZ",
      postalCode: "85119",
      name: "150 East Old West Highway",
      description: "150 East Old West Highway, Apache Junction, Arizona 85119, United States",
      lng: -111.5,
      lat: 33.4,
    })
  })

  it("falls back to the GeoJSON geometry", () => {
    const row = toLocationRow({ ...base, properties: { ...base.properties, coordinates: undefined } })
    expect(row).toMatchObject({ lng: -1, lat: -2 })
  })

  it("skips features without a machine id or coordinates", () => {
    expect(toLocationRow({ ...base, properties: { ...base.properties, machineID: "" } })).toBeNull()
    expect(
      toLocationRow({ properties: { ...base.properties, coordinates: undefined } }),
    ).toBeNull()
  })
})
