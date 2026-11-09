import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { GET as coverageRoute } from "@/app/api/admin/coverage/route"
import { GET as aggregatesRoute } from "@/app/api/locations/aggregates/route"
import { refreshRegionCounts } from "@/server/services/region-counts"
import type { Coverage } from "@/lib/admin/coverage"
import { insertProfiles } from "./testDatabase"

const ADMIN = randomUUID()
const MOD = randomUUID()

beforeEach(async () => {
  await insertProfiles(getDb(), [
    { id: ADMIN, username: "misty", role: "admin" },
    { id: MOD, username: "brock", role: "moderator" },
  ])
  await getDb()
    .insert(locations)
    .values([
      ...Array.from({ length: 3 }, (_, i) => ({ machineId: `C${i}`, retailer: "Safeway", state: "CA", geog: { lng: -118 - i * 0.01, lat: 34 } })),
      ...Array.from({ length: 2 }, (_, i) => ({ machineId: `W${i}`, retailer: "QFC", state: "WA", geog: { lng: -122 - i * 0.01, lat: 47 } })),
      { machineId: "X0", retailer: "Safeway", state: "WA", geog: { lng: -122.5, lat: 47 }, isActive: false },
      { kind: "shop" as const, name: "Card Kingdom", state: "WA", geog: { lng: -122.38, lat: 47.66 } },
    ])
  await refreshRegionCounts()
})

const get = (userId: string) => coverageRoute(new NextRequest("http://localhost/api/admin/coverage", { headers: { "x-user-id": userId } }))

describe("GET /api/admin/coverage", () => {
  it("counts vending machines by state and retailer, totals by kind, and countries", async () => {
    const res = await get(ADMIN)
    expect(res.status).toBe(200)
    const c = (await res.json()) as Coverage
    expect(c.vendingByState).toEqual([
      { state: "California", count: 3 },
      { state: "Washington", count: 2 },
    ])
    expect(c.states).toBe(2)
    expect(c.byRetailer).toEqual([
      { retailer: "Safeway", count: 3 },
      { retailer: "QFC", count: 2 },
    ])
    expect(c.retailers).toBe(2)
    expect(c.totals).toEqual({ vending: 5, shop: 1 })
    expect(c.countries).toEqual([
      { name: "United States", count: 6, status: "live" },
      { name: "Canada", count: 0, status: "next" },
    ])
  })

  it("matches /api/locations/aggregates", async () => {
    const c = (await (await get(ADMIN)).json()) as Coverage
    const { counts } = (await (await aggregatesRoute(new NextRequest("http://localhost/api/locations/aggregates"))).json()) as { counts: { kind: string; count: number }[] }
    const sum = (kind: string) => counts.filter((x) => x.kind === kind).reduce((n, x) => n + x.count, 0)
    expect(c.totals.vending).toBe(sum("vending"))
    expect(c.totals.shop).toBe(sum("shop"))
  })

  it("is for admins only", async () => {
    expect((await get(MOD)).status).toBe(404)
  })
})
