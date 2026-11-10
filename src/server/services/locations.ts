import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { OUTSIDE_LOWER_48 } from "@/lib/map/states"
import type { LocationFeature, LocationFeatureCollection, LocationKind, NearbyLocations, StateCities } from "@/lib/types/locations"
import type { Bbox } from "@/lib/locations/bbox"

/** The most locations one viewport request returns. */
/** The most locations one viewport request returns (#201); `truncated` says when there were more. */
export const BBOX_LIMIT = 500

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
 * this stays fast as the table grows. It returns at most `limit` and sets
 * `truncated` when more matched: there's no uncapped form, so no caller can
 * list every location (#201). With `canaries`, the decoys too (#202; they're
 * inactive): only the map's viewport request asks.
 */
export async function queryFeatures(
  db: Database,
  where: SQL,
  limit: number,
  // Unqualified columns, so it applies to both CTEs below.
  orderBy: SQL = sql`"machineID", id`,
  { canaries = false }: { canaries?: boolean } = {},
): Promise<LocationFeatureCollection> {
  const shown = canaries ? sql`(l.is_active or l.canary)` : sql`l.is_active`
  const rows = await db.execute<{ fc: LocationFeatureCollection }>(sql`
    with matched as (
      select l.* from ${locations} l
      where ${shown} and l.geog is not null and ${where}
      order by ${orderBy}
      limit ${limit + 1}
    ),
    page as (
      select * from matched
      limit ${limit}
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
  return rows[0].fc
}

/**
 * A city as typed, with runs of whitespace (tabs, NBSPs from a paste) as one
 * space and none at the ends; group on `lower()` of it. (\s alone misses
 * NBSP under C ctype.)
 */
export const cityName = (column: SQL) => sql`trim(regexp_replace(coalesce(${column}, ''), '[\\s\u00a0]+', ' ', 'g'))`

/**
 * One spelling per city however it was typed, in an aggregate: title case if
 * any row has it ("Seattle" over "SEATTLE" and "seattle"), then not all caps
 * ("King of Prussia" over "KING OF PRUSSIA"), then not all lowercase.
 */
export const preferredSpelling = (name: SQL) =>
  sql`(array_agg(${name} order by ${name} <> initcap(${name}), ${name} = upper(${name}), ${name} = lower(${name}), ${name}))[1]`

/** Miles to meters, for PostGIS distances on geography. */
export const METERS_PER_MILE = 1609.344

export const kindsIn = (types: readonly LocationKind[]) => sql.join(types.map((t) => sql`${t}`), sql`, `)
/** Vending machines of these retailers only (other kinds aren't filtered), as the map's `retailer=` does. Empty means all. */
export const retailerIn = (retailers: readonly string[]) =>
  retailers.length ? sql`and (l.kind <> 'vending' or coalesce(l.retailer, l.name) in (${sql.join(retailers.map((r) => sql`${r}`), sql`, `)}))` : sql``
export const pointOf = ([lng, lat]: readonly [number, number]) => sql`ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography`

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
export const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`)

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
/** The most rows one near request returns (#201); counts and the total still cover every match. */
export const NEAR_LIMIT = 200

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

/** The most cities one state lists. */
export const TOP_CITIES_LIMIT = 30

/**
 * The cities in a state with the most active locations of `types`, most
 * first, each placed at the middle of its locations (so a pick centers the
 * radius on them), plus the state's counts per kind: the list for
 * exploring a state.
 */
export async function getTopCities(
  state: string,
  types: readonly LocationKind[],
  db: Database = getDb(),
  limit = TOP_CITIES_LIMIT,
  retailers: readonly string[] = [],
): Promise<StateCities> {
  if (types.length === 0) return { cities: [], counts: {}, total: 0 }
  // A US state: another country's region can share the code (WA, Western Australia).
  const matched = sql`
    select * from ${locations} l
    where l.is_active and l.geog is not null and l.country_code = 'US' and l.state = ${state} and l.kind in (${kindsIn(types)})
      ${retailerIn(retailers)}
  `
  const name = cityName(sql`m.city`)
  const [cities, counts] = await Promise.all([
    db.execute<StateCities["cities"][number]>(sql`
      select ${preferredSpelling(name)} as city,
        count(*)::int as count,
        round(avg(ST_X(m.geog::geometry))::numeric, 4)::float8 as lng,
        round(avg(ST_Y(m.geog::geometry))::numeric, 4)::float8 as lat
      from (${matched}) m
      where ${name} <> ''
      group by lower(${name})
      order by count desc, city
      limit ${limit}
    `),
    db.execute<{ kind: LocationKind; n: number }>(sql`select m.kind, count(*)::int as n from (${matched}) m group by m.kind`),
  ])
  const byKind: StateCities["counts"] = {}
  let total = 0
  for (const { kind, n } of counts) {
    byKind[kind] = n
    total += n
  }
  return { cities: [...cities], counts: byKind, total }
}

/** The landing map's grid: cells this many degrees on a side (~25 km). */
export const VENDING_CELL_DEG = 0.25

/**
 * Active vending machines in the lower 48, counted per VENDING_CELL_DEG grid
 * cell, for the landing page's background map: `[lng, lat, count]` with each
 * cell's south-west corner. Coarse on purpose, so the page can't be read
 * back into a list of machine locations.
 */
export async function getVendingCells(db: Database = getDb()): Promise<[number, number, number][]> {
  const perDeg = Math.round(1 / VENDING_CELL_DEG)
  const rows = await db.execute<{ x: number; y: number; n: number }>(sql`
    select floor(ST_X(geog::geometry) * ${perDeg})::int as x, floor(ST_Y(geog::geometry) * ${perDeg})::int as y, count(*)::int as n
    from ${locations}
    where is_active and geog is not null and kind = 'vending'
      -- The lower 48 and DC, as the map frames them (a row without a state counts by its point).
      and country_code = 'US' and coalesce(state, '') not in (${sql.join(OUTSIDE_LOWER_48.map((s) => sql`${s}`), sql`, `)})
      and ST_X(geog::geometry) between -125 and -66 and ST_Y(geog::geometry) between 24 and 50
    group by 1, 2
    order by 1, 2
  `)
  return rows.map((r) => [r.x / perDeg, r.y / perDeg, r.n])
}

export interface BboxQuery {
  bbox: Bbox
  /** Kinds to include. Empty means none. */
  types: readonly LocationKind[]
  limit?: number
}

/**
 * Active locations inside `bbox`, for the map above zoom 6, with any canaries
 * there (#202): this is the request that hands out the data in bulk, so it's
 * the one a copy would come from. The test is
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
    undefined,
    { canaries: true },
  )
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** One active, positioned location as a feature, or null (also for an id that isn't a uuid). */
export async function getLocationFeature(id: string, db: Database = getDb()): Promise<LocationFeature | null> {
  if (!UUID.test(id)) return null
  const fc = await queryFeatures(db, sql`l.id = ${id}`, 1)
  return fc.features[0] ?? null
}
