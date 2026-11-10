import { describe, it, expect } from "vitest"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { countLocationsNear, getActiveLocationsGeoJSON, getLocationFeature, getLocationsInBbox, getLocationsNear, getTopCities, getVendingCells, searchLocations } from "@/server/services/locations"
import { milesBetween } from "@/lib/map/geo"
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

describe("countLocationsNear", () => {
  // Downtown Seattle; Tacoma is ~25 mi south.
  const seattle = [-122.335, 47.608] as const
  const tacoma = [-122.444, 47.253] as const

  it("counts active locations of the given kinds within the radius of each point", async () => {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "S1", retailer: "QFC", geog: { lng: -122.33, lat: 47.61 } },
        { machineId: "S2", retailer: "Safeway", geog: { lng: -122.3, lat: 47.66 } }, // ~4.5 mi
        { name: "Card shop", kind: "shop", geog: { lng: -122.34, lat: 47.6 } },
        { machineId: "SOFF", retailer: "Closed", geog: { lng: -122.33, lat: 47.61 }, isActive: false },
        { machineId: "T1", retailer: "Fred Meyer", geog: { lng: -122.44, lat: 47.25 } },
      ])
    expect(await countLocationsNear([seattle, tacoma, [0, 0]], 10, ["vending", "shop", "event"])).toEqual([3, 1, 0])
    expect(await countLocationsNear([seattle], 10, ["vending"])).toEqual([2])
    expect(await countLocationsNear([seattle], 5, ["vending"])).toEqual([2])
    // Tacoma is ~25.1 mi away: outside 25, inside 50.
    expect(await countLocationsNear([seattle], 25, ["vending"])).toEqual([2])
    expect(await countLocationsNear([seattle], 50, ["vending"])).toEqual([3])
    expect(await countLocationsNear([seattle], 10, [])).toEqual([0])
    expect(await countLocationsNear([], 10, ["vending"])).toEqual([])
    // A retailer filter narrows vending machines only, as the map's `retailer=` does.
    expect(await countLocationsNear([seattle], 10, ["vending", "shop"], ["QFC"])).toEqual([2])
    expect(await countLocationsNear([seattle], 10, ["vending"], ["Safeway", "QFC"])).toEqual([2])
  })
})

describe("searchLocations", () => {
  async function seed() {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "K1", retailer: "King Soopers", address: "1155 E 9th Ave", city: "Denver", state: "CO", geog: { lng: -104.97, lat: 39.73 } },
        { machineId: "K2", retailer: "King Soopers", address: "3050 E 3rd Ave", city: "Denver", state: "CO", geog: { lng: -104.95, lat: 39.72 } },
        { machineId: "K3", retailer: "Kroger", address: "1592 S Loop 288", city: "Denton", state: "TX", geog: { lng: -97.1, lat: 33.2 } },
        { machineId: "K4", retailer: "Kroger", address: "100% Main St", city: "Dallas", state: "TX", geog: { lng: -96.8, lat: 32.8 } },
        { name: "Den of Cards", kind: "shop", address: "1 Pearl St", city: "Boulder", state: "CO", geog: { lng: -105.27, lat: 40.01 } },
        { machineId: "KOFF", retailer: "King Soopers", city: "Denver", geog: { lng: -104.97, lat: 39.73 }, isActive: false },
      ])
  }
  const names = (fc: { features: { properties: { retailer: string; city: string } }[] }) => fc.features.map((f) => `${f.properties.retailer} ${f.properties.city}`)

  it("matches the retailer or name, address and city, case-insensitively", async () => {
    await seed()
    const all = ["vending", "shop", "event"] as const
    expect(names(await searchLocations({ q: "king", types: all }))).toEqual(["King Soopers Denver", "King Soopers Denver"])
    expect(names(await searchLocations({ q: "den", types: all })).sort()).toEqual(
      ["Den of Cards Boulder", "King Soopers Denver", "King Soopers Denver", "Kroger Denton"].sort(),
    )
    expect(names(await searchLocations({ q: "loop 288", types: all }))).toEqual(["Kroger Denton"])
    expect(names(await searchLocations({ q: "k3", types: all }))).toEqual(["Kroger Denton"])
  })

  it("filters by kind, ranks by distance from `near`, and limits", async () => {
    await seed()
    expect(names(await searchLocations({ q: "den", types: ["shop"] }))).toEqual(["Den of Cards Boulder"])
    expect(names(await searchLocations({ q: "kroger", types: ["vending"], near: [-96.8, 32.8] }))).toEqual(["Kroger Dallas", "Kroger Denton"])
    expect(names(await searchLocations({ q: "kroger", types: ["vending"], near: [-97.1, 33.2], limit: 1 }))).toEqual(["Kroger Denton"])
    expect(names(await searchLocations({ q: "den", types: ["vending", "shop"], retailers: ["Kroger"] })).sort()).toEqual(["Den of Cards Boulder", "Kroger Denton"])
  })

  it("treats % and _ as plain characters", async () => {
    await seed()
    expect(names(await searchLocations({ q: "100%", types: ["vending"] }))).toEqual(["Kroger Dallas"])
    // Only the address with a literal %, not every location.
    expect(names(await searchLocations({ q: "%", types: ["vending"] }))).toEqual(["Kroger Dallas"])
    expect(names(await searchLocations({ q: "_", types: ["vending"] }))).toEqual([])
  })
})

describe("getLocationsNear", () => {
  const seattle = [-122.3285, 47.6196] as const

  it("lists active locations inside the radius, closest first, with distances and counts", async () => {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "FAR", retailer: "Safeway", geog: { lng: -122.35, lat: 47.7 } }, // ~5.6 mi
        { machineId: "NEAR", retailer: "QFC", geog: { lng: -122.32, lat: 47.62 } }, // ~0.4 mi
        { name: "Card shop", kind: "shop", geog: { lng: -122.33, lat: 47.6 } },
        { machineId: "OUT", retailer: "QFC", geog: { lng: -122.44, lat: 47.25 } }, // Tacoma
        { machineId: "OFF", retailer: "QFC", geog: { lng: -122.33, lat: 47.62 }, isActive: false },
      ])
    const fc = await getLocationsNear({ center: seattle, radiusMiles: 10, types: ["vending", "shop", "event"] })
    expect(fc.features.map((f) => f.properties.machineID || f.properties.retailer)).toEqual(["NEAR", "Card shop", "FAR"])
    expect(fc.features[0].properties.distance).toBeCloseTo(0.4, 1)
    expect(fc.counts).toEqual({ vending: 2, shop: 1 })
    expect(fc.total).toBe(3)
    expect(fc.truncated).toBe(false)

    const five = await getLocationsNear({ center: seattle, radiusMiles: 5, types: ["vending"] })
    expect(five.features.map((f) => f.properties.machineID)).toEqual(["NEAR"])
    expect(five.counts).toEqual({ vending: 1 })
  })

  it("filters vending machines by retailer and leaves other kinds alone", async () => {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "Q", retailer: "QFC", geog: { lng: -122.32, lat: 47.62 } },
        { machineId: "S", retailer: "Safeway", geog: { lng: -122.31, lat: 47.62 } },
        { name: "Card shop", kind: "shop", geog: { lng: -122.33, lat: 47.6 } },
      ])
    const fc = await getLocationsNear({ center: seattle, radiusMiles: 10, types: ["vending", "shop"], retailers: ["Safeway"] })
    expect(fc.features.map((f) => f.properties.machineID || f.properties.retailer).sort()).toEqual(["Card shop", "S"])
  })

  it("counts every match past the limit and says the list is cut", async () => {
    await getDb()
      .insert(locations)
      .values([0, 1, 2].map((i) => ({ machineId: `M${i}`, retailer: "QFC", geog: { lng: -122.32 + i * 0.01, lat: 47.62 } })))
    const fc = await getLocationsNear({ center: seattle, radiusMiles: 10, types: ["vending"], limit: 2 })
    expect(fc.features.map((f) => f.properties.machineID)).toEqual(["M0", "M1"])
    expect(fc.total).toBe(3)
    expect(fc.truncated).toBe(true)
  })

  it("holds exactly the locations the map shows inside the circle", async () => {
    // A ring of points straddling the 10 mi edge, 0.05 mi apart in distance.
    const values = Array.from({ length: 72 }, (_, i) => {
      const bearing = (i * 5 * Math.PI) / 180
      const miles = 9.9 + (i % 5) * 0.05
      const dLat = (miles / 69.05) * Math.cos(bearing)
      const dLng = ((miles / 69.05) * Math.sin(bearing)) / Math.cos((seattle[1] * Math.PI) / 180)
      return { machineId: `R${i}`, retailer: "QFC", geog: { lng: seattle[0] + dLng, lat: seattle[1] + dLat } }
    })
    await getDb().insert(locations).values(values)
    const fc = await getLocationsNear({ center: seattle, radiusMiles: 10, types: ["vending"] })
    const listed = new Set(fc.features.map((f) => f.properties.machineID))
    const inside = values.filter((v) => milesBetween(seattle[0], seattle[1], v.geog.lng, v.geog.lat) <= 10).map((v) => v.machineId)
    expect(inside.length).toBeGreaterThan(10)
    expect(inside.length).toBeLessThan(72)
    expect([...listed].sort()).toEqual(inside.sort())
  })
})

describe("getTopCities", () => {
  it("ranks a state's cities by active locations of the shown kinds, each at the middle of its locations", async () => {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "S1", retailer: "QFC", city: "Seattle", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "S2", retailer: "QFC", city: " seattle ", state: "WA", geog: { lng: -122.4, lat: 47.7 } },
        { machineId: "T1", retailer: "Safeway", city: "Tacoma", state: "WA", geog: { lng: -122.44, lat: 47.25 } },
        { name: "Card shop", kind: "shop", city: "Tacoma", state: "WA", geog: { lng: -122.45, lat: 47.25 } },
        { machineId: "NC", retailer: "QFC", city: "", state: "WA", geog: { lng: -120, lat: 47 } },
        { machineId: "OFF", retailer: "QFC", city: "Seattle", state: "WA", geog: { lng: -122.3, lat: 47.6 }, isActive: false },
        { machineId: "P1", retailer: "Fred Meyer", city: "Portland", state: "OR", geog: { lng: -122.68, lat: 45.52 } },
      ])
    const all = await getTopCities("WA", ["vending", "shop", "event"])
    expect(all.cities).toEqual([
      { city: "Seattle", count: 2, lng: -122.35, lat: 47.65 },
      { city: "Tacoma", count: 2, lng: -122.445, lat: 47.25 },
    ])
    // The city-less location counts toward the state, not a city.
    expect(all.counts).toEqual({ vending: 4, shop: 1 })
    expect(all.total).toBe(5)

    const vending = await getTopCities("WA", ["vending"])
    expect(vending.cities.map((c) => [c.city, c.count])).toEqual([
      ["Seattle", 2],
      ["Tacoma", 1],
    ])
    expect((await getTopCities("WA", [])).cities).toEqual([])
    expect((await getTopCities("WA", ["vending"], undefined, 1)).cities).toHaveLength(1)
  })

  it("merges spellings, prefers title case, keeps to the US and follows the retailer filter", async () => {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "A1", retailer: "QFC", city: "SEATTLE", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "A2", retailer: "QFC", city: "Seattle", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "A3", retailer: "Safeway", city: "Port  Angeles", state: "WA", geog: { lng: -123.4, lat: 48.1 } },
        { machineId: "A4", retailer: "Safeway", city: "Port\tAngeles", state: "WA", geog: { lng: -123.4, lat: 48.1 } },
        { machineId: "A5", retailer: "Safeway", city: "Seattle\t", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "A6", retailer: "Safeway", city: "\u00a0\t", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "K1", retailer: "Safeway", city: "KING OF PRUSSIA", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        { machineId: "K2", retailer: "Safeway", city: "King\u00a0of Prussia", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
        // Western Australia shares the code.
        { machineId: "AU", retailer: "Coles", city: "Perth", state: "WA", countryCode: "AU", geog: { lng: 115.86, lat: -31.95 } },
      ])
    const all = await getTopCities("WA", ["vending"])
    expect(all.cities.map((c) => [c.city, c.count])).toEqual([
      ["Seattle", 3],
      ["King of Prussia", 2],
      ["Port Angeles", 2],
    ])
    // The whitespace-only city counts toward the state, not a city.
    expect(all.total).toBe(8)
    const qfc = await getTopCities("WA", ["vending"], undefined, undefined, ["QFC"])
    expect(qfc.cities.map((c) => [c.city, c.count])).toEqual([["Seattle", 2]])
    expect(qfc.total).toBe(2)
  })
})

describe("getVendingCells", () => {
  it("counts active vending machines in the lower 48 per 0.25° cell, by its south-west corner", async () => {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "A", retailer: "QFC", geog: { lng: -122.3321, lat: 47.6062 } },
        { machineId: "B", retailer: "QFC", geog: { lng: -122.26, lat: 47.74 } }, // the same cell
        { machineId: "C", retailer: "QFC", geog: { lng: -122.24, lat: 47.6 } }, // the next cell east
        { name: "Card shop", kind: "shop", geog: { lng: -104.99, lat: 39.74 } },
        { machineId: "OFF", retailer: "QFC", geog: { lng: -80, lat: 35 }, isActive: false },
        // Outside the lower 48: Anchorage, Honolulu, Vancouver BC.
        { machineId: "AK", retailer: "Fred Meyer", state: "AK", geog: { lng: -149.9, lat: 61.2 } },
        { machineId: "HI", retailer: "Safeway", state: "HI", geog: { lng: -157.86, lat: 21.31 } },
        { machineId: "CA", retailer: "Save-On", state: "BC", countryCode: "CA", geog: { lng: -123.12, lat: 49.28 } },
      ])
    expect(await getVendingCells()).toEqual([
      [-122.5, 47.5, 2],
      [-122.25, 47.5, 1],
    ])
  })
})
