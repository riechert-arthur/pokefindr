import { afterAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import postgres from "postgres"
import { eq } from "drizzle-orm"
import { createMigrator } from "../../scripts/db/migrator"
import { canaryClashes, listCanaries, plantCanaries, removeCanaries } from "../../scripts/canary/plant"
import type { Canary } from "../../scripts/canary/decoys"
import { loadStaging, mergeStaging, parseFeatures, verifyImport, type SourceFeature } from "../../scripts/one-off/import-locations"
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
import { getAreaStats } from "@/server/services/areas"
import { getRegionCounts, getTopRetailers, refreshRegionCounts } from "@/server/services/region-counts"
import { addReview } from "@/server/services/reviews"
import { addLocationReport } from "@/server/services/reports"
import { addVendingMachine, checkVendingOverlap } from "@/server/services/vending"
import { GET as bboxRoute } from "@/app/api/locations/route"
import { GET as detailsRoute } from "@/app/api/locations/[id]/route"
import { GET as nearRoute } from "@/app/api/locations/near/route"
import { GET as searchRoute } from "@/app/api/locations/search/route"
import { insertProfiles, testDatabaseUrl } from "./testDatabase"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
afterAll(() => sql.end({ timeout: 5 }))

let ip = 0
const get = (route: (r: NextRequest) => Promise<Response>, query: string) =>
  route(new NextRequest(`http://localhost/api/x?${query}`, { headers: { "x-forwarded-for": `198.51.100.${++ip % 250}` } }))

// Seattle: a real machine and a canary 2 km apart, with the same retailer.
const REAL = { lng: -122.33, lat: 47.61 }
const DECOY = { lng: -122.33, lat: 47.628 }

async function seed() {
  const [real, canary] = await getDb()
    .insert(locations)
    .values([
      { machineId: "Q00001", retailer: "QFC", address: "1 Pike St", city: "Seattle", state: "WA", geog: REAL, source: "pokemoncenter" },
      { machineId: "Q00002", retailer: "QFC", address: "9 Pine St", city: "Seattle", state: "WA", geog: DECOY, canary: true, source: "canary" },
    ])
    .returning()
  return { real, canary }
}

const ids = (fc: { features: { properties: { id: string } }[] }) => fc.features.map((f) => f.properties.id).sort()

describe("canary locations (#202)", () => {
  it("show up everywhere like any other place, and the flag is never sent", async () => {
    const { real, canary } = await seed()
    const both = [real.id, canary.id].sort()
    const seattle = [-122.4, 47.55, -122.25, 47.7]

    expect(ids(await getLocationsInBbox({ bbox: [-122.4, 47.55, -122.25, 47.7], types: ["vending"] }))).toEqual(both)
    const near = await getLocationsNear({ center: [REAL.lng, REAL.lat], radiusMiles: 10, types: ["vending"] })
    expect([ids(near), near.total, near.counts]).toEqual([both, 2, { vending: 2 }])
    expect(await countLocationsNear([[REAL.lng, REAL.lat]], 10, ["vending"])).toEqual([2])
    expect(ids(await searchLocations({ q: "Pine", types: ["vending"] }))).toEqual([canary.id])
    expect(ids(await searchLocations({ q: "Q00002", types: ["vending"] }))).toEqual([canary.id])
    expect(ids(await searchLocations({ q: "QFC", types: ["vending"] }))).toEqual(both)
    expect(await getTopCities("WA", ["vending"])).toMatchObject({ cities: [{ city: "Seattle", count: 2 }], total: 2 })
    expect(await getVendingCells()).toEqual([[-122.5, 47.5, 2]])
    expect(await getAreaStats({ state: "WA" }, ["vending"])).toMatchObject({ total: 2 })
    await refreshRegionCounts()
    expect(await getRegionCounts()).toEqual([{ country: "US", region: "WA", kind: "vending", count: 2 }])
    expect(await getTopRetailers()).toEqual([{ retailer: "QFC", count: 2 }])

    // The routes return it, without saying what it is.
    const feature = await getLocationFeature(canary.id)
    expect(feature?.properties).toEqual({ id: canary.id, machineID: "Q00002", retailer: "QFC", address: "9 Pine St", city: "Seattle", state: "WA", kind: "vending" })
    const responses = [
      await get(bboxRoute, `bbox=${seattle.join(",")}`),
      await get(nearRoute, `lng=${REAL.lng}&lat=${REAL.lat}&r=10`),
      await get(searchRoute, "q=Pine"),
      await detailsRoute(new NextRequest(`http://localhost/api/locations/${canary.id}`), { params: Promise.resolve({ id: canary.id }) }),
    ]
    for (const res of responses) {
      expect(res.status).toBe(200)
      const body = await res.text()
      expect(body).toContain(canary.id)
      expect(body).not.toMatch(/canary/i)
    }

    // A visitor can review or report it like any place.
    const userId = crypto.randomUUID()
    await insertProfiles(getDb(), { id: userId, username: "visitor" })
    expect(await addReview({ locationId: canary.id, userId, rating: 5, text: "Stocked" })).not.toBeNull()
    expect(await addLocationReport({ locationId: canary.id, userId, reason: "gone" })).not.toBe("not_found")
  })

  it("become the real machine when the import brings one with the same ID, and aren't import extras otherwise", async () => {
    const { canary } = await seed()
    const { db } = createMigrator(sql)
    const run = (features: SourceFeature[]) =>
      db.transaction().execute(async (trx) => {
        await loadStaging(trx, parseFeatures({ features }).rows)
        await mergeStaging(trx)
        return verifyImport(trx)
      })
    const pike: SourceFeature = { geometry: { type: "Point", coordinates: [REAL.lng, REAL.lat] }, properties: { machineID: "Q00001", retailer: "QFC", address: "1 Pike St", city: "Seattle", state: "WA" } }
    expect(await run([pike])).toMatchObject({ problems: [], extras: [] })

    const redmond: SourceFeature = { geometry: { type: "Point", coordinates: [-122.1, 47.7] }, properties: { machineID: "Q00002", retailer: "QFC", address: "5 Main St", city: "Redmond", state: "WA" } }
    expect((await run([pike, redmond])).problems).toEqual([])
    const [row] = await sql`select canary, is_active, city, source from locations where id = ${canary.id}`
    expect(row).toEqual({ canary: false, is_active: true, city: "Redmond", source: "pokemoncenter" })
  })

  describe("when an admin adds a machine", () => {
    const ADMIN = crypto.randomUUID()
    const add = async (over: Record<string, unknown>) => {
      await insertProfiles(getDb(), { id: ADMIN, username: "misty", role: "admin" })
      return addVendingMachine({ retailer: "Safeway", machineId: "Q00500", address: "1 New St", city: "Redmond", state: "WA", lat: 47.67, lng: -122.12, ...over }, ADMIN)
    }

    it("takes over a canary with its machine ID", async () => {
      const { canary } = await seed()
      expect(await checkVendingOverlap({ machineId: "Q00002", address: "1 New St", state: "WA", lat: 47.67, lng: -122.12 })).toEqual([])
      expect(await add({ machineId: "q00002" })).toEqual({ status: "added", id: canary.id })
      const [row] = await getDb().select().from(locations).where(eq(locations.id, canary.id))
      expect(row).toMatchObject({ canary: false, machineId: "Q00002", retailer: "Safeway", city: "Redmond", source: "manual", createdBy: ADMIN, isActive: true })
      expect(await getDb().select().from(locations)).toHaveLength(2)
    })

    it("takes over a canary at the same address", async () => {
      const { canary } = await seed()
      expect(await add({ address: "9 Pine Street", city: "Seattle", lat: DECOY.lat + 0.01, lng: DECOY.lng })).toEqual({ status: "added", id: canary.id })
      const [row] = await getDb().select().from(locations).where(eq(locations.id, canary.id))
      expect(row).toMatchObject({ canary: false, machineId: "Q00500", address: "9 Pine Street" })
    })

    it("still refuses an overlap with a real machine, listing only that one", async () => {
      const { real } = await seed()
      const res = await add({ machineId: "Q00002", address: "1 Pike St", city: "Seattle", lat: REAL.lat, lng: REAL.lng })
      expect(res).toMatchObject({ status: "overlap", overlaps: [{ id: real.id }] })
      if (res.status === "overlap") expect(res.overlaps).toHaveLength(1)
    })
  })
})

describe("canary:plant", () => {
  /** Two machines each of QFC in Seattle and Safeway in Portland; one Kroger in Houston, too few for a canary. */
  async function seedTowns() {
    await getDb()
      .insert(locations)
      .values([
        { machineId: "Q00010", retailer: "QFC", address: "1 Pike St", city: "Seattle", state: "WA", geog: { lng: -122.34, lat: 47.61 } },
        { machineId: "Q00020", retailer: "QFC", address: "2 Pike St", city: "Seattle", state: "WA", geog: { lng: -122.32, lat: 47.61 } },
        { machineId: "Q00030", retailer: "Safeway", address: "1 Burnside St", city: "Portland", state: "OR", geog: { lng: -122.69, lat: 45.52 } },
        { machineId: "Q00040", retailer: "Safeway", address: "2 Burnside St", city: "Portland", state: "OR", geog: { lng: -122.67, lat: 45.52 } },
        { machineId: "Q00050", retailer: "Kroger", address: "1 Main St", city: "Houston", state: "TX", geog: { lng: -95.37, lat: 29.76 } },
      ])
  }
  const centers: Record<string, { lng: number; lat: number }> = { "QFC Seattle": { lng: -122.33, lat: 47.61 }, "Safeway Portland": { lng: -122.68, lat: 45.52 } }
  const flagged = () => sql<{ machineID: string; is_active: boolean; canary: boolean }[]>`select "machineID", is_active, canary from locations where canary order by 1`

  it("adds only what's missing, from real retailers' towns and unused IDs among the real ones", async () => {
    await seedTowns()
    const first = await plantCanaries(getDb(), 1)
    expect(first.total).toBe(1)
    const second = await plantCanaries(getDb(), 2)
    expect([second.added.length, second.total]).toEqual([1, 2])
    expect(await plantCanaries(getDb(), 2)).toEqual({ added: [], total: 2 })

    const canaries = [...first.added, ...second.added]
    expect(canaries.map((c) => `${c.retailer} ${c.city}`).sort()).toEqual(["QFC Seattle", "Safeway Portland"])
    for (const c of canaries) {
      const n = Number(c.machineID.slice(1))
      expect(c.machineID).toMatch(/^Q\d{5}$/)
      expect(n).toBeGreaterThan(0)
      expect(n).toBeLessThan(50)
      expect(n % 10).not.toBe(0)
      const center = centers[`${c.retailer} ${c.city}`]
      const [{ km }] = await sql<{ km: number }[]>`
        select ST_Distance(ST_MakePoint(${c.lng}, ${c.lat})::geography, ST_MakePoint(${center.lng}, ${center.lat})::geography) / 1000 as km`
      expect(km).toBeGreaterThan(0.99)
      expect(km).toBeLessThan(4.01)
    }
    expect(await flagged()).toEqual(canaries.map((c) => ({ machineID: c.machineID, is_active: true, canary: true })).sort((a, b) => a.machineID.localeCompare(b.machineID)))

    // No third town has two machines: nothing is written.
    await expect(plantCanaries(getDb(), 3)).rejects.toThrow(/Couldn't place 1 more canary/)
    expect(await flagged()).toHaveLength(2)
    await expect(plantCanaries(getDb(), 33)).rejects.toThrow(/count/)
  })

  it("lists the canaries in the database, and removes them", async () => {
    await seedTowns()
    await getDb()
      .insert(locations)
      .values({ machineId: "Q00015", retailer: "QFC", address: "9 Pine St", city: "Seattle", state: "WA", geog: { lng: -122.33, lat: 47.628 }, canary: true, source: "canary" })
    expect(await listCanaries(getDb())).toEqual([{ machineID: "Q00015", retailer: "QFC", address: "9 Pine St", city: "Seattle", state: "WA", lng: -122.33, lat: 47.628 }])
    // That canary counts toward the total, and its town gets no second one.
    const { added } = await plantCanaries(getDb(), 2)
    expect(added.map((c) => c.city)).toEqual(["Portland"])
    expect(await removeCanaries(getDb())).toBe(2)
    expect(await listCanaries(getDb())).toEqual([])
    expect(await getDb().select().from(locations)).toHaveLength(5)
  })

  it("refuses a decoy near a real location, or on its machine ID or address", async () => {
    await seedTowns()
    const decoy = (over: Partial<Canary>): Canary => ({ machineID: "Q00011", retailer: "QFC", address: "77 Elm St", city: "Seattle", state: "WA", lng: -122.33, lat: 47.64, ...over })
    expect(await canaryClashes(getDb(), decoy({}))).toEqual([])
    const reasons = async (over: Partial<Canary>) => (await canaryClashes(getDb(), decoy(over))).map((o) => [o.machineId, o.reasons])
    // 200 m from Q00010 (and over 250 m from Q00020).
    expect(await reasons({ lng: -122.34, lat: 47.6118 })).toEqual([["Q00010", ["distance"]]])
    expect(await reasons({ machineID: "Q00020" })).toEqual([["Q00020", ["machine_id"]]])
    expect(await reasons({ address: "1 Pike Street" })).toEqual([["Q00010", ["address"]]])
    // Another canary nearby isn't a real location.
    await getDb().insert(locations).values({ machineId: "Q00012", retailer: "QFC", address: "78 Elm St", city: "Seattle", state: "WA", geog: { lng: -122.33, lat: 47.6401 }, canary: true })
    expect(await canaryClashes(getDb(), decoy({}))).toEqual([])
  })
})
