import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import type { LocationFeatureCollection, LocationKind } from "@/lib/types/locations"
import { METERS_PER_MILE, cityName, kindsIn, likeEscape, pointOf, preferredSpelling, queryFeatures, retailerIn } from "./locations"

/** An area to count or list in: around a point, or a US state. */
export type Area = { center: readonly [number, number]; radiusMiles: number } | { state: string }

/** Active, positioned locations of `types` in the area (the map's rows). */
const inArea = (area: Area, types: readonly LocationKind[], retailers: readonly string[]): SQL => sql`
  l.is_active and l.geog is not null and l.kind in (${kindsIn(types)})
  and ${
    "state" in area
      ? // A US state: another country's region can share the code (WA, Western Australia).
        sql`l.country_code = 'US' and l.state = ${area.state}`
      : sql`ST_DWithin(l.geog, ${pointOf(area.center)}, ${area.radiusMiles * METERS_PER_MILE}, false)`
  }
  ${retailerIn(retailers)}`

/** A state's locations of `types`, by city then name, with how many there are in all. */
export async function getLocationsInState(
  { state, types, retailers = [], limit }: { state: string; types: readonly LocationKind[]; retailers?: readonly string[]; limit: number },
  db: Database = getDb(),
): Promise<{ features: LocationFeatureCollection["features"]; total: number }> {
  if (types.length === 0) return { features: [], total: 0 }
  const where = sql`l.country_code = 'US' and l.state = ${state} and l.kind in (${kindsIn(types)}) ${retailerIn(retailers)}`
  const [fc, [{ n }]] = await Promise.all([
    queryFeatures(db, where, limit, sql`lower(coalesce(city, '')), coalesce(retailer, name), id`),
    db.execute<{ n: number }>(sql`select count(*)::int as n from ${locations} l where l.is_active and l.geog is not null and ${where}`),
  ])
  return { features: fc.features, total: n }
}

export interface AreaStats {
  total: number
  byKind: Partial<Record<LocationKind, number>>
  /** Vending retailers with the most machines here, most first. */
  topRetailers: { retailer: string; count: number }[]
  /** Cities with the most locations here, most first. */
  topCities: { city: string; state: string; count: number }[]
}

/** Counts for an area: per kind, the top vending retailers and the top cities. */
export async function getAreaStats(area: Area, types: readonly LocationKind[], db: Database = getDb(), top = 6): Promise<AreaStats> {
  if (types.length === 0) return { total: 0, byKind: {}, topRetailers: [], topCities: [] }
  const where = inArea(area, types, [])
  const name = cityName(sql`l.city`)
  const [kinds, retailers, cities] = await Promise.all([
    db.execute<{ kind: LocationKind; n: number }>(sql`select l.kind, count(*)::int as n from ${locations} l where ${where} group by l.kind`),
    db.execute<{ retailer: string; count: number }>(sql`
      select coalesce(l.retailer, l.name) as retailer, count(*)::int as count
      from ${locations} l
      where ${where} and l.kind = 'vending' and coalesce(l.retailer, l.name, '') <> ''
      group by 1 order by count desc, retailer limit ${top}`),
    db.execute<{ city: string; state: string; count: number }>(sql`
      select ${preferredSpelling(name)} as city, coalesce(l.state, '') as state, count(*)::int as count
      from ${locations} l
      where ${where} and ${name} <> ''
      group by lower(${name}), coalesce(l.state, '')
      order by count desc, city limit ${top}`),
  ])
  const byKind: AreaStats["byKind"] = {}
  let total = 0
  for (const { kind, n } of kinds) {
    byKind[kind] = n
    total += n
  }
  return { total, byKind, topRetailers: [...retailers], topCities: [...cities] }
}

/**
 * The vending retailers whose name contains `term` (any case), most machines
 * first: what a typed "safeway" or "fred meyer" means as the map's exact
 * retailer names.
 */
export async function matchRetailers(term: string, db: Database = getDb(), limit = 5): Promise<string[]> {
  const t = term.trim()
  if (!t) return []
  const rows = await db.execute<{ retailer: string }>(sql`
    select coalesce(retailer, name) as retailer
    from ${locations}
    where is_active and kind = 'vending' and coalesce(retailer, name) ilike ${`%${likeEscape(t)}%`}
    group by 1 order by count(*) desc, 1 limit ${limit}`)
  return rows.map((r) => r.retailer)
}

/** Which of `ids` are sample places (seed data, `source = 'sample'`). */
export async function sampleIds(ids: readonly string[], db: Database = getDb()): Promise<Set<string>> {
  if (ids.length === 0) return new Set()
  const rows = await db.execute<{ id: string }>(sql`
    select id from ${locations} where source = 'sample' and id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`)
  return new Set(rows.map((r) => r.id))
}
