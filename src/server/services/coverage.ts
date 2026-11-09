import "server-only"
import { sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { getRegionCounts, getTopRetailers } from "@/server/services/region-counts"
import { NEXT_COUNTRIES, type Coverage } from "@/lib/admin/coverage"
import { SUPPORTED_COUNTRIES } from "@/lib/map/countries"
import { STATES } from "@/lib/map/states"
import type { LocationKind } from "@/lib/types/locations"

/**
 * The Coverage page (#156). States, kinds and countries come from the same
 * region counts as /api/locations/aggregates, so the numbers match the
 * map; retailers from the locations themselves (the view isn't by
 * retailer).
 */
export async function getCoverage(db: Database = getDb()): Promise<Coverage> {
  const [counts, top, [{ retailers }]] = await Promise.all([
    getRegionCounts(db),
    getTopRetailers(8, db),
    db.execute<{ retailers: number }>(sql`
      select count(distinct coalesce(retailer, name))::int as retailers from ${locations}
      where is_active and geog is not null and kind = 'vending' and country_code = 'US' and coalesce(retailer, name, '') <> ''
    `),
  ])
  const totals: Partial<Record<LocationKind, number>> = {}
  const byCountry = new Map<string, number>()
  const vending = new Map<string, number>()
  for (const c of counts) {
    totals[c.kind] = (totals[c.kind] ?? 0) + c.count
    byCountry.set(c.country, (byCountry.get(c.country) ?? 0) + c.count)
    if (c.kind === "vending" && c.country === "US" && c.region) vending.set(c.region, (vending.get(c.region) ?? 0) + c.count)
  }
  const states = [...vending].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  return {
    vendingByState: states.slice(0, 12).map(([state, count]) => ({ state: STATES[state]?.name ?? state, count })),
    states: states.length,
    byRetailer: top,
    retailers,
    totals,
    countries: [
      ...SUPPORTED_COUNTRIES.map((c) => ({ name: c.name, count: byCountry.get(c.alpha2) ?? 0, status: "live" as const })),
      ...NEXT_COUNTRIES.map((name) => ({ name, count: 0, status: "next" as const })),
    ],
  }
}
