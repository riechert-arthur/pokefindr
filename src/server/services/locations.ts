import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import type { LocationFeature, LocationFeatureCollection, LocationKind, NearbyLocations } from "@/lib/types/locations"
import type { Bbox } from "@/lib/locations/bbox"

/** The most locations one viewport request returns. */
export const BBOX_LIMIT = 2000

/**
 * One row of `locations` (as `p`) as a GeoJSON Feature, the shape the map
 * and lists read. `extra` adds properties, e.g. a distance.
 */
const featureJson = (extra: SQL = sql``) => sql`
  json_build_object(
    'type', 'Feature',
    'id', p.id,
    'geometry', ST_AsGeoJSON(p.geog::geometry, 6)::json,
    'properties', json_build_object(
      'id', p.id,
      'machineID', coalesce(p."machineID", ''),
      'retailer', coalesce(p.retailer, p.name, ''),
      'address', coalesce(p.address, ''),
      'city', coalesce(p.city, ''),
      'state', coalesce(p.state, ''),
      'kind', p.kind
      ${extra}
    )
  )`

/**
 * Active, positioned locations matching `where`, as a GeoJSON
 * FeatureCollection built in one query. Postgres does the JSON assembly, so
 * this stays fast as the table grows. With `limit`, it returns at most that
 * many and sets `truncated` when more matched.
 */
async function queryFeatures(
  db: Database,
  where: SQL = sql`true`,
  limit?: number,
  // Unqualified columns, so it applies to both CTEs below.
  orderBy: SQL = sql`"machineID", id`,
): Promise<LocationFeatureCollection> {
  const rows = await db.execute<{ fc: LocationFeatureCollection }>(sql`
    with matched as (
      select l.* from ${locations} l
      where l.is_active and l.geog is not null and ${where}
      order by ${orderBy}
      ${limit === undefined ? sql`` : sql`limit ${limit + 1}`}
    ),
    page as (
      select * from matched
      ${limit === undefined ? sql`` : sql`limit ${limit}`}
    )
    select json_build_object(
      'type', 'FeatureCollection',
      'features', coalesce((
        select json_agg(
          ${featureJson()}
          order by ${orderBy}
        )
        from page p
      ), '[]'::json),
      'truncated', (select count(*) from matched) > (select count(*) from page)
    ) as fc
  `)
  const fc = rows[0].fc
  // `truncated` is only meaningful for capped queries.
  if (limit === undefined) delete fc.truncated
  return fc
}

/** All active locations as a GeoJSON FeatureCollection. */
export async function getActiveLocationsGeoJSON(
  db: Database = getDb(),
): Promise<LocationFeatureCollection> {
  return queryFeatures(db)
}

/** Miles to meters, for PostGIS distances on geography. */
export const METERS_PER_MILE = 1609.344

const kindsIn = (types: readonly LocationKind[]) => sql.join(types.map((t) => sql`${t}`), sql`, `)
/** Vending machines of these retailers only (other kinds aren't filtered), as the map's `retailer=` does. Empty means all. */
const retailerIn = (retailers: readonly string[]) =>
  retailers.length ? sql`and (l.kind <> 'vending' or coalesce(l.retailer, l.name) in (${sql.join(retailers.map((r) => sql`${r}`), sql`, `)}))` : sql``
const pointOf = ([lng, lat]: readonly [number, number]) => sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`

/**
 * How many active locations of `types` lie within `radiusMiles` of each
 * point, in the same order: the counts beside each area in the search list.
 * One query; the GiST index on `geog` answers each ST_DWithin.
 */
export async function countLocationsNear(
  points: readonly (readonly [number, number])[],
  radiusMiles: number,
  types: readonly LocationKind[],
  retailers: readonly string[] = [],
  db: Database = getDb(),
): Promise<number[]> {
  if (points.length === 0) return []
  if (types.length === 0) return points.map(() => 0)
  const values = sql.join(points.map(([lng, lat], i) => sql`(${i}::int, ${lng}::float8, ${lat}::float8)`), sql`, `)
  const rows = await db.execute<{ i: number; n: number }>(sql`
    select p.i, count(l.id)::int as n
    from (values ${values}) as p(i, lng, lat)
    left join ${locations} l
      on l.is_active and l.kind in (${kindsIn(types)})
      and ST_DWithin(l.geog, ST_SetSRID(ST_MakePoint(p.lng, p.lat), 4326)::geography, ${radiusMiles * METERS_PER_MILE})
      ${retailerIn(retailers)}
    group by p.i
  `)
  const counts = points.map(() => 0)
  for (const { i, n } of rows) counts[i] = n
  return counts
}

export interface LocationSearch {
  /** Matched against the retailer or name, address and city; a machine id must match exactly. */
  q: string
  types: readonly LocationKind[]
  /** [lng, lat]: closest first. Without it, by retailer. */
  near?: readonly [number, number]
  /** Vending retailers to keep, as in the map's URL; empty means all. */
  retailers?: readonly string[]
  limit?: number
}

/** `%` and `_` are wildcards in LIKE; a search for them means the characters. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

/** Active locations whose retailer, name, address or city contains `q`: the search list's Locations group. */
export async function searchLocations(
  { q, types, near, retailers = [], limit = 5 }: LocationSearch,
  db: Database = getDb(),
): Promise<LocationFeatureCollection> {
  const term = q.trim()
  if (types.length === 0 || term === "") return { type: "FeatureCollection", features: [] }
  const like = `%${likeEscape(term)}%`
  const fc = await queryFeatures(
    db,
    sql`l.kind in (${kindsIn(types)}) and (
      coalesce(l.retailer, l.name, '') ilike ${like}
      or l.address ilike ${like}
      or l.city ilike ${like}
      or l."machineID" = ${term.toUpperCase()}
    ) ${retailerIn(retailers)}`,
    limit,
    near ? sql`ST_Distance(geog, ${pointOf(near)}), id` : sql`coalesce(retailer, name), city, id`,
  )
  delete fc.truncated
  return fc
}

/** The most results one radius search returns; the list shows them all, closest first. */
export const NEAR_LIMIT = 500

export interface NearQuery {
  /** [lng, lat] of the place. */
  center: readonly [number, number]
  radiusMiles: number
  types: readonly LocationKind[]
  /** Vending retailers to keep; other kinds aren't filtered. Empty or absent means all. */
  retailers?: readonly string[]
  limit?: number
}

/**
 * Active locations within `radiusMiles` of `center`, closest first, each
 * with its `distance` in miles: the results list of a place search. `counts`
 * and `total` cover every match, even past `limit` (then `truncated` is set).
 */
export async function getLocationsNear(
  { center, radiusMiles, types, retailers = [], limit = NEAR_LIMIT }: NearQuery,
  db: Database = getDb(),
): Promise<NearbyLocations> {
  if (types.length === 0) return { type: "FeatureCollection", features: [], counts: {}, total: 0, truncated: false }
  const point = pointOf(center)
  const rows = await db.execute<{ fc: NearbyLocations }>(sql`
    with matched as (
      -- On the sphere (use_spheroid false), as the map measures (milesBetween),
      -- so the list holds exactly the dots the map shows inside the circle.
      select l.*, ST_Distance(l.geog, ${point}, false) / ${METERS_PER_MILE} as miles
      from ${locations} l
      where l.is_active and l.geog is not null and l.kind in (${kindsIn(types)})
        and ST_DWithin(l.geog, ${point}, ${radiusMiles * METERS_PER_MILE}, false)
        ${retailerIn(retailers)}
    ),
    page as (
      select * from matched order by miles, id limit ${limit}
    )
    select json_build_object(
      'type', 'FeatureCollection',
      'features', coalesce((
        select json_agg(${featureJson(sql`, 'distance', round(p.miles::numeric, 2)`)} order by p.miles, p.id)
        from page p
      ), '[]'::json),
      'counts', coalesce((select json_object_agg(kind, n) from (select kind, count(*)::int as n from matched group by kind) k), '{}'::json),
      'total', (select count(*)::int from matched),
      'truncated', (select count(*) from matched) > (select count(*) from page)
    ) as fc
  `)
  return rows[0].fc
}

export interface BboxQuery {
  bbox: Bbox
  /** Kinds to include. Empty means none. */
  types: readonly LocationKind[]
  limit?: number
}

/**
 * Active locations inside `bbox`, for the map above zoom 6. The test is
 * planar: `geog::geometry && envelope` keeps exactly the points between the
 * box's meridians and parallels, using the GiST index on `geog::geometry`.
 * (On geography, `&&` compares boxes on the sphere, which bow out: it
 * returned points ~10 km past a city-sized box's sides.)
 */
export async function getLocationsInBbox(
  { bbox, types, limit = BBOX_LIMIT }: BboxQuery,
  db: Database = getDb(),
): Promise<LocationFeatureCollection> {
  if (types.length === 0) return { type: "FeatureCollection", features: [], truncated: false }
  const [west, south, east, north] = bbox
  return queryFeatures(
    db,
    sql`l.geog::geometry && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
      and l.kind in (${kindsIn(types)})`,
    limit,
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One active, positioned location as a feature, or null (also for an id that isn't a uuid). */
export async function getLocationFeature(id: string, db: Database = getDb()): Promise<LocationFeature | null> {
  if (!UUID.test(id)) return null
  const fc = await queryFeatures(db, sql`l.id = ${id}`, 1)
  return fc.features[0] ?? null
}
