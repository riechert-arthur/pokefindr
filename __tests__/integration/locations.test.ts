import { describe, it, expect } from "vitest"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { getActiveLocationsGeoJSON } from "@/server/services/locations"

describe("getActiveLocationsGeoJSON", () => {
  it("returns an empty collection when there are no locations", async () => {
    expect(await getActiveLocationsGeoJSON()).toEqual({ type: "FeatureCollection", features: [] })
  })

  it("returns active, positioned locations with ids and display fields", async () => {
    const db = getDb()
    const [active] = await db
      .insert(locations)
      .values({
        machineId: "Q00350",
        retailer: "Frys",
        address: "150 E Old West Hwy",
        city: "Apache Junction",
        state: "AZ",
        geog: { lng: -111.544047, lat: 33.413887 },
      })
      .returning()
    await db.insert(locations).values([
      { machineId: "GONE", retailer: "Old", geog: { lng: 0, lat: 0 }, isActive: false },
      { machineId: "NOPOS", retailer: "Nowhere" },
      { name: "User-added spot", geog: { lng: -80, lat: 35 } },
    ])

    const fc = await getActiveLocationsGeoJSON()
    expect(fc.features.map((f) => f.properties.machineID)).toEqual(["Q00350", ""])

    const [frys, userAdded] = fc.features
    expect(frys).toEqual({
      type: "Feature",
      id: active.id,
      geometry: { type: "Point", coordinates: [-111.544047, 33.413887] },
      properties: {
        id: active.id,
        machineID: "Q00350",
        retailer: "Frys",
        address: "150 E Old West Hwy",
        city: "Apache Junction",
        state: "AZ",
      },
    })
    // Falls back to the location name when retailer is missing, and never returns null strings.
    expect(userAdded.properties).toMatchObject({ retailer: "User-added spot", address: "", city: "" })
  })
})
