import { describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { getRegionCounts, getTopRetailers, refreshRegionCounts } from "@/server/services/region-counts"
import { runJob } from "@/server/lib/jobs/run"
import postgres from "postgres"
import { testDatabaseUrl } from "./testDatabase"

describe("region counts", () => {
  it("match select count(*) per state and kind once refreshed", async () => {
    const db = getDb()
    await db.insert(locations).values([
      { machineId: "WA1", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
      { machineId: "WA2", state: "WA", geog: { lng: -122.4, lat: 47.7 } },
      { name: "Shop", kind: "shop", state: "WA", geog: { lng: -122.3, lat: 47.5 } },
      { machineId: "AZ1", state: "AZ", geog: { lng: -111.9, lat: 33.4 } },
      { machineId: "NOSTATE", geog: { lng: -100, lat: 40 } },
      { machineId: "OFF", state: "AZ", geog: { lng: -111.8, lat: 33.5 }, isActive: false },
      { machineId: "NOPOS", state: "AZ" },
    ])

    expect(await refreshRegionCounts()).toEqual({ rows: 4 })

    const expected = await db.execute<{ country: string; region: string; kind: string; count: number }>(sql`
      select country_code as country, coalesce(state, '') as region, kind, count(*)::integer as count
      from locations where is_active and geog is not null
      group by 1, 2, 3 order by 1, 2, 3`)
    const counts = await getRegionCounts()
    expect(counts).toEqual([...expected])
    expect(counts).toEqual([
      { country: "US", region: "", kind: "vending", count: 1 },
      { country: "US", region: "AZ", kind: "vending", count: 1 },
      { country: "US", region: "WA", kind: "shop", count: 1 },
      { country: "US", region: "WA", kind: "vending", count: 2 },
    ])
  })

  it("filter vending machines by retailer (other kinds unfiltered), and rank retailers", async () => {
    const db = getDb()
    await db.insert(locations).values([
      { machineId: "S1", retailer: "Safeway", state: "WA", geog: { lng: -122.3, lat: 47.6 } },
      { machineId: "S2", retailer: "Safeway", state: "OR", geog: { lng: -122.6, lat: 45.5 } },
      { machineId: "Q1", retailer: "QFC", state: "WA", geog: { lng: -122.4, lat: 47.7 } },
      { name: "Shop", kind: "shop", state: "WA", geog: { lng: -122.3, lat: 47.5 } },
      { machineId: "OFF", retailer: "Safeway", state: "WA", geog: { lng: -122.3, lat: 47.6 }, isActive: false },
      { machineId: "CA", retailer: "Save-On", state: "BC", countryCode: "CA", geog: { lng: -123.1, lat: 49.3 } },
    ])
    expect(await getRegionCounts(db, ["Safeway"])).toEqual([
      { country: "US", region: "OR", kind: "vending", count: 1 },
      { country: "US", region: "WA", kind: "shop", count: 1 },
      { country: "US", region: "WA", kind: "vending", count: 1 },
    ])
    expect(await getTopRetailers(12, db)).toEqual([
      { retailer: "Safeway", count: 2 },
      { retailer: "QFC", count: 1 },
    ])
  })

  it("keep serving the old counts until the next refresh", async () => {
    const db = getDb()
    await db.insert(locations).values({ machineId: "WA1", state: "WA", geog: { lng: -122.3, lat: 47.6 } })
    await refreshRegionCounts()
    await db.insert(locations).values({ machineId: "WA2", state: "WA", geog: { lng: -122.4, lat: 47.7 } })
    expect((await getRegionCounts())[0].count).toBe(1)
    await refreshRegionCounts()
    expect((await getRegionCounts())[0].count).toBe(2)
  })

  it("refresh without blocking readers (CONCURRENTLY)", async () => {
    await getDb().insert(locations).values({ machineId: "WA1", state: "WA", geog: { lng: -122.3, lat: 47.6 } })
    // A reader in the middle of a transaction holds an ACCESS SHARE lock on the
    // view. A plain REFRESH needs ACCESS EXCLUSIVE and would wait for it;
    // REFRESH ... CONCURRENTLY only needs EXCLUSIVE, which readers don't block.
    const reader = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
    try {
      await reader.begin(async (tx) => {
        await tx`select count(*) from location_region_counts`
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("refresh waited for the reader")), 3000))
        await expect(Promise.race([refreshRegionCounts(), timeout])).resolves.toEqual({ rows: 1 })
      })
    } finally {
      await reader.end({ timeout: 5 })
    }
  })

  it("refresh through the job library", async () => {
    await getDb().insert(locations).values({ machineId: "WA1", state: "WA", geog: { lng: -122.3, lat: 47.6 } })
    await expect(runJob("refresh-region-counts", undefined, { trigger: "cli" })).resolves.toEqual({ rows: 1 })
    expect(await getRegionCounts()).toHaveLength(1)
  })
})
