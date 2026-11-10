import { afterAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import postgres from "postgres"
import { createMigrator } from "../../scripts/db/migrator"
import { generateCanaries } from "../../scripts/canary/decoys"
import { plantCanaries } from "../../scripts/canary/plant"
import { loadStaging, mergeStaging, parseFeatures, verifyImport } from "../../scripts/one-off/import-locations"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import {
  countLocationsNear,
  getLocationFeature,
  getLocationsInBbox,
  getLocationsNear,
  getTopCities,
  getVendingCells,
  searchLocations,
} from "@/server/services/locations"
import { getAreaStats, getLocationsInState, matchRetailers } from "@/server/services/areas"
import { getRegionCounts, getTopRetailers, refreshRegionCounts } from "@/server/services/region-counts"
import { addReview } from "@/server/services/reviews"
import { addLocationReport } from "@/server/services/reports"
import { GET as getLocations } from "@/app/api/locations/route"
import { GET as getLocation } from "@/app/api/locations/[id]/route"
import { insertProfiles, testDatabaseUrl } from "./testDatabase"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
afterAll(() => sql.end({ timeout: 5 }))

const SEED = "integration-canary-seed"
// Seattle, where the real machine and the canary below sit 2 km apart.
const REAL = { lng: -122.33, lat: 47.61 }
const DECOY = { lng: -122.33, lat: 47.628 }

/** A real machine and a canary in the same city, with the same retailer. */
async function seed() {
  const [real, canary] = await getDb()
    .insert(locations)
    .values([
      { machineId: "Q00001", retailer: "QFC", address: "1 Pike St", city: "Seattle", state: "WA", geog: REAL },
      { machineId: "Q03001", retailer: "QFC", address: "9 Pine St", city: "Seattle", state: "WA", geog: DECOY, isActive: false, canary: true, source: "canary" },
    ])
    .returning()
  return { real, canary }
}

const ids = (fc: { features: { properties: { id: string } }[] }) => fc.features.map((f) => f.properties.id)

describe("canary locations (#202)", () => {
  it("are returned by the map's viewport request, and only there", async () => {
    const { real, canary } = await seed()
    const seattle = [-122.4, 47.55, -122.25, 47.7] as const

    expect(ids(await getLocationsInBbox({ bbox: [...seattle], types: ["vending"] }))).toEqual([real.id, canary.id])
    const res = await getLocations(new NextRequest(`http://localhost/api/locations?bbox=${seattle.join(",")}`))
    expect(ids(await res.json())).toEqual([real.id, canary.id])

    // Everything else sees only the real machine.
    const near = await getLocationsNear({ center: [DECOY.lng, DECOY.lat], radiusMiles: 10, types: ["vending"] })
    expect([ids(near), near.total, near.counts]).toEqual([[real.id], 1, { vending: 1 }])
    expect(await countLocationsNear([[DECOY.lng, DECOY.lat]], 10, ["vending"])).toEqual([1])
    expect(ids(await searchLocations({ q: "Pine", types: ["vending"] }))).toEqual([])
    expect(ids(await searchLocations({ q: "Q03001", types: ["vending"] }))).toEqual([])
    expect(ids(await searchLocations({ q: "QFC", types: ["vending"] }))).toEqual([real.id])
    expect(await getTopCities("WA", ["vending"])).toMatchObject({ cities: [{ city: "Seattle", count: 1 }], total: 1 })
    // The landing map's grid counts only the real machine.
    expect(await getVendingCells()).toEqual([[-122.5, 47.5, 1]])
    expect(await getLocationFeature(canary.id)).toBeNull()
    expect((await getLocation(new NextRequest(`http://localhost/api/locations/${canary.id}`), { params: Promise.resolve({ id: canary.id }) })).status).toBe(404)

    await refreshRegionCounts()
    expect(await getRegionCounts()).toEqual([{ country: "US", region: "WA", kind: "vending", count: 1 }])
    expect(await getRegionCounts(undefined, ["QFC"])).toEqual([{ country: "US", region: "WA", kind: "vending", count: 1 }])
    expect(await getTopRetailers()).toEqual([{ retailer: "QFC", count: 1 }])
    expect(await getAreaStats({ state: "WA" }, ["vending"])).toMatchObject({ total: 1, topCities: [{ city: "Seattle", count: 1 }] })
    expect(await getLocationsInState({ state: "WA", types: ["vending"], limit: 10 })).toMatchObject({ total: 1, features: [{ id: real.id }] })
    expect(await matchRetailers("qfc")).toEqual(["QFC"])

    const userId = crypto.randomUUID()
    await insertProfiles(getDb(), { id: userId, username: "visitor" })
    expect(await addReview({ locationId: canary.id, userId, rating: 5, text: "Stocked" })).toBeNull()
    expect(await addLocationReport({ locationId: canary.id, userId, reason: "gone" })).toBe("not_found")
  })

  it("can't be switched on", async () => {
    const { canary } = await seed()
    await expect(sql`update locations set is_active = true where id = ${canary.id}`).rejects.toThrow(/locations_canary_check/)
  })

  it("stop being canaries when the import brings a real machine with the same ID", async () => {
    const { canary } = await seed()
    const { db } = createMigrator(sql)
    const { rows } = parseFeatures({
      features: [
        { geometry: { type: "Point", coordinates: [-122.2, 47.6] }, properties: { machineID: "Q00001", retailer: "QFC", address: "1 Pike St", city: "Seattle", state: "WA" } },
        { geometry: { type: "Point", coordinates: [-122.1, 47.7] }, properties: { machineID: "Q03001", retailer: "QFC", address: "5 Main St", city: "Redmond", state: "WA" } },
      ],
    })
    const verify = await db.transaction().execute(async (trx) => {
      await loadStaging(trx, rows)
      await mergeStaging(trx)
      return verifyImport(trx)
    })
    expect(verify.problems).toEqual([])
    const [row] = await sql`select canary, is_active, city from locations where id = ${canary.id}`
    expect(row).toEqual({ canary: false, is_active: true, city: "Redmond" })
  })

  it("aren't listed as extras by the import", async () => {
    await seed()
    const { db } = createMigrator(sql)
    const { rows } = parseFeatures({
      features: [{ geometry: { type: "Point", coordinates: [REAL.lng, REAL.lat] }, properties: { machineID: "Q00001", retailer: "QFC", address: "1 Pike St", city: "Seattle", state: "WA" } }],
    })
    const verify = await db.transaction().execute(async (trx) => {
      await loadStaging(trx, rows)
      await mergeStaging(trx)
      return verifyImport(trx)
    })
    expect(verify.extras).toEqual([])
  })
})

describe("plantCanaries", () => {
  const canaryRows = () =>
    sql<{ machineID: string; retailer: string; address: string; is_active: boolean; lng: number; lat: number }[]>`
      select "machineID", retailer, address, is_active, ST_X(geog::geometry) as lng, ST_Y(geog::geometry) as lat
      from locations where canary order by "machineID"`

  it("adds the seed's decoys as inactive canaries, and running it again changes nothing", async () => {
    const decoys = generateCanaries(SEED, 4)
    expect(await plantCanaries(sql, decoys)).toEqual({ added: 4, updated: 0, unchanged: 0, stale: [], pruned: 0 })
    expect(await plantCanaries(sql, generateCanaries(SEED, 4))).toEqual({ added: 0, updated: 0, unchanged: 4, stale: [], pruned: 0 })
    const rows = await canaryRows()
    expect(rows).toHaveLength(4)
    for (const d of decoys) {
      expect(rows).toContainEqual({ machineID: d.machineID, retailer: d.retailer, address: d.address, is_active: false, lng: d.lng, lat: d.lat })
    }
  })

  it("keeps canaries another seed made unless pruned", async () => {
    const old = generateCanaries(SEED, 2)
    await plantCanaries(sql, old)
    const next = generateCanaries(`${SEED}-other`, 2)
    const kept = await plantCanaries(sql, next)
    expect(kept).toMatchObject({ added: 2, stale: old.map((c) => c.machineID).sort(), pruned: 0 })
    expect(await plantCanaries(sql, next, { prune: true })).toMatchObject({ unchanged: 2, pruned: 2 })
    expect((await canaryRows()).map((r) => r.machineID)).toEqual(next.map((c) => c.machineID).sort())
  })

  it("writes nothing when a decoy would sit near a real location or take its machine ID", async () => {
    const [first, second] = generateCanaries(SEED, 2)
    await getDb()
      .insert(locations)
      .values([
        { machineId: "REAL1", retailer: "Safeway", address: "1 Main St", city: first.city, state: first.state, geog: { lng: first.lng + 0.001, lat: first.lat } },
        { machineId: second.machineID, retailer: "Safeway", geog: { lng: -100, lat: 40 } },
      ])
    const err = await plantCanaries(sql, [first, second]).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toContain(`${first.machineID}: REAL1 (1 Main St, ${first.city})`)
    expect((err as Error).message).toContain(`${second.machineID}: ${second.machineID}`)
    expect(await canaryRows()).toEqual([])
  })
})
