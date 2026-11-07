import { describe, it, expect } from "vitest"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { getActiveLocationsGeoJSON, getLocationFeature, getLocationsInBbox } from "@/server/services/locations"
import type { Bbox } from "@/lib/locations/bbox"

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
        kind: "vending",
      },
    })
    // Falls back to the location name when retailer is missing, and never returns null strings.
    expect(userAdded.properties).toMatchObject({ retailer: "User-added spot", address: "", city: "" })
  })
})

describe("getLocationsInBbox", () => {
  // Roughly Seattle.
  const seattle: Bbox = [-122.46, 47.48, -122.22, 47.74]

  async function seed() {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "SEA1", retailer: "QFC", state: "WA", geog: { lng: -122.33, lat: 47.61 } },
        { machineId: "SEA2", retailer: "Fred Meyer", state: "WA", geog: { lng: -122.36, lat: 47.66 } },
        { name: "Card shop", kind: "shop", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "TAC1", retailer: "Safeway", state: "WA", geog: { lng: -122.44, lat: 47.25 } },
        // Just past the box's west and east edges, where a spherical box test bows out.
        { machineId: "WEST", retailer: "Bainbridge", state: "WA", geog: { lng: -122.5, lat: 47.6 } },
        { machineId: "EAST", retailer: "Bellevue", state: "WA", geog: { lng: -122.17, lat: 47.6 } },
        { machineId: "SEAOFF", retailer: "Closed", state: "WA", geog: { lng: -122.33, lat: 47.62 }, isActive: false },
      ])
  }

  it("returns only active locations inside the box", async () => {
    await seed()
    const fc = await getLocationsInBbox({ bbox: seattle, types: ["vending", "shop", "event"] })
    expect(fc.features.map((f) => f.properties.machineID || f.properties.retailer).sort()).toEqual(["Card shop", "SEA1", "SEA2"])
    expect(fc.truncated).toBe(false)
  })

  it("filters by kind", async () => {
    await seed()
    const shops = await getLocationsInBbox({ bbox: seattle, types: ["shop"] })
    expect(shops.features.map((f) => f.properties.kind)).toEqual(["shop"])
    const none = await getLocationsInBbox({ bbox: seattle, types: [] })
    expect(none.features).toEqual([])
  })

  it("caps the result and says so", async () => {
    await seed()
    const fc = await getLocationsInBbox({ bbox: seattle, types: ["vending", "shop", "event"], limit: 2 })
    expect(fc.features).toHaveLength(2)
    expect(fc.truncated).toBe(true)

    const exact = await getLocationsInBbox({ bbox: seattle, types: ["vending", "shop", "event"], limit: 3 })
    expect(exact.features).toHaveLength(3)
    expect(exact.truncated).toBe(false)
  })
})

describe("getLocationFeature", () => {
  it("returns one active location, and null otherwise", async () => {
    const db = getDb()
    const [on, off] = await db
      .insert(locations)
      .values([
        { machineId: "ON", retailer: "QFC", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "OFF", retailer: "Old", geog: { lng: -122.3, lat: 47.6 }, isActive: false },
      ])
      .returning()
    expect((await getLocationFeature(on.id))?.properties).toMatchObject({ id: on.id, machineID: "ON", kind: "vending" })
    expect(await getLocationFeature(off.id)).toBeNull()
    expect(await getLocationFeature("00000000-0000-0000-0000-000000000000")).toBeNull()
    expect(await getLocationFeature("not-a-uuid")).toBeNull()
  })
})
