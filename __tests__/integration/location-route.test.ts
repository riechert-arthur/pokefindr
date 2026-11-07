import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
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
})
