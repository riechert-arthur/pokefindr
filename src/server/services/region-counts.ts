import "server-only"
import { asc, sql } from "drizzle-orm"
import { z } from "zod"
import { getDb, type Database } from "@/server/db/client"
import { locationRegionCounts, locations } from "@/server/db/schema"
import { defineJob } from "@/server/lib/jobs/types"
import type { RegionCount } from "@/lib/types/locations"

/** Every row of the `location_region_counts` view, sorted by country, region and kind (or, with retailers, the same counts filtered by them). */
export async function getRegionCounts(db: Database = getDb(), retailers: readonly string[] = []): Promise<RegionCount[]> {
  if (retailers.length) return getRegionCountsFor(retailers, db)
  return db
    .select()
    .from(locationRegionCounts)
    .orderBy(asc(locationRegionCounts.country), asc(locationRegionCounts.region), asc(locationRegionCounts.kind))
}

/**
 * The same counts with the map's retailer filter (vending machines of those
 * retailers; other kinds unfiltered), computed from `locations`: the view
 * isn't by retailer. A few thousand rows, so it's quick.
 */
async function getRegionCountsFor(retailers: readonly string[], db: Database): Promise<RegionCount[]> {
  const rows = await db.execute<RegionCount & Record<string, unknown>>(sql`
    select country_code as country, coalesce(state, '') as region, kind, count(*)::integer as count
    from ${locations}
    where is_active and geog is not null
      and (kind <> 'vending' or coalesce(retailer, name) in (${sql.join(retailers.map((r) => sql`${r}`), sql`, `)}))
    group by country_code, coalesce(state, ''), kind
    order by 1, 2, 3
  `)
  return rows.map(({ country, region, kind, count }) => ({ country, region, kind, count }))
}

export interface RetailerCount {
  retailer: string
  count: number
}

/** Vending retailers in the US with their active machines, most first: the filter's options. */
export async function getTopRetailers(limit = 12, db: Database = getDb()): Promise<RetailerCount[]> {
  const rows = await db.execute<RetailerCount & Record<string, unknown>>(sql`
    select coalesce(retailer, name) as retailer, count(*)::integer as count
    from ${locations}
    where is_active and geog is not null and kind = 'vending' and country_code = 'US' and coalesce(retailer, name, '') <> ''
    group by 1
    order by count desc, retailer
    limit ${limit}
  `)
  return rows.map(({ retailer, count }) => ({ retailer, count }))
}

/**
 * Recomputes the view from `locations`. CONCURRENTLY, so the map keeps reading
 * the old counts until the new ones are ready.
 */
export async function refreshRegionCounts(db: Database = getDb()): Promise<{ rows: number }> {
  await db.execute(sql`refresh materialized view concurrently ${locationRegionCounts}`)
  const [{ rows }] = await db.execute<{ rows: number }>(sql`select count(*)::integer as rows from ${locationRegionCounts}`)
  return { rows }
}

/** Runs nightly (vercel.json) and after location imports. Safe to repeat. */
export const refreshRegionCountsJob = defineJob({
  description: "Refreshes the per-state location counts for the zoomed-out map",
  schema: z.unknown(),
  async run() {
    return refreshRegionCounts()
  },
})
