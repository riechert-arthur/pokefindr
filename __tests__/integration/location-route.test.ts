import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { cardShopDetails, locations } from "@/server/db/schema"
import { GET } from "@/app/api/locations/[id]/route"

const get = (id: string) => GET(new NextRequest(`http://localhost/api/locations/${id}`), { params: Promise.resolve({ id }) })

describe("GET /api/locations/[id]", () => {
  it("returns an active location as a feature, 404 otherwise, 400 for a bad id", async () => {
    const [on, off] = await getDb()
      .insert(locations)
      .values([
        { machineId: "ON", retailer: "QFC", city: "Seattle", state: "WA", geog: { lng: -122.32, lat: 47.62 } },
        { machineId: "OFF", retailer: "Old", geog: { lng: -122.3, lat: 47.6 }, isActive: false },
      ])
      .returning()
    const res = await get(on.id)
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ type: "Feature", id: on.id, geometry: { coordinates: [-122.32, 47.62] }, properties: { retailer: "QFC", machineID: "ON" } })
    expect((await get(off.id)).status).toBe(404)
    expect((await get("not-an-id")).status).toBe(400)
  })

  it("adds a shop's website, only for shops (#399)", async () => {
    const [shop, bare, machine] = await getDb()
      .insert(locations)
      .values([
        { kind: "shop", retailer: "Bleecker Trading", city: "New York", state: "NY", geog: { lng: -74.0, lat: 40.73 } },
        { kind: "shop", retailer: "No Site Cards", geog: { lng: -74.01, lat: 40.74 } },
        { machineId: "Q9", retailer: "QFC", geog: { lng: -122.32, lat: 47.62 } },
      ])
      .returning()
    await getDb().insert(cardShopDetails).values({ locationId: shop.id, website: "https://www.bleeckertrading.com/", sells: [] })
    expect((await (await get(shop.id)).json()).properties).toMatchObject({ kind: "shop", website: "https://www.bleeckertrading.com/" })
    expect((await (await get(bare.id)).json()).properties.website).toBeNull()
    expect((await (await get(machine.id)).json()).properties).not.toHaveProperty("website")
  })
})
