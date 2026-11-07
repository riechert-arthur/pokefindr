import "server-only"
import { asc, sql } from "drizzle-orm"
import { z } from "zod"
import { getDb, type Database } from "@/server/db/client"
import { locationRegionCounts } from "@/server/db/schema"
import { defineJob } from "@/server/lib/jobs/types"
import type { RegionCount } from "@/lib/types/locations"

/** Every row of the `location_region_counts` view, sorted by country, region and kind. */
export async function getRegionCounts(db: Database = getDb()): Promise<RegionCount[]> {
  return db
    .select()
    .from(locationRegionCounts)
    .orderBy(asc(locationRegionCounts.country), asc(locationRegionCounts.region), asc(locationRegionCounts.kind))
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
