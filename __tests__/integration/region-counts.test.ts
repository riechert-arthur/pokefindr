import { describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { getRegionCounts, refreshRegionCounts } from "@/server/services/region-counts"
import { runJob } from "@/server/lib/jobs/run"

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

  it("keep serving the old counts until the next refresh", async () => {
    const db = getDb()
    await db.insert(locations).values({ machineId: "WA1", state: "WA", geog: { lng: -122.3, lat: 47.6 } })
    await refreshRegionCounts()
    await db.insert(locations).values({ machineId: "WA2", state: "WA", geog: { lng: -122.4, lat: 47.7 } })
    expect((await getRegionCounts())[0].count).toBe(1)
    await refreshRegionCounts()
    expect((await getRegionCounts())[0].count).toBe(2)
  })

  it("refresh through the job library", async () => {
    await getDb().insert(locations).values({ machineId: "WA1", state: "WA", geog: { lng: -122.3, lat: 47.6 } })
    await expect(runJob("refresh-region-counts", undefined, { trigger: "cli" })).resolves.toEqual({ rows: 1 })
    expect(await getRegionCounts()).toHaveLength(1)
  })
})
