import "server-only"
import { sql, type SQL } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import type { LocationFeatureCollection, LocationKind } from "@/lib/types/locations"
import type { Bbox } from "@/lib/locations/bbox"

/** The most locations one viewport request returns. */
export const BBOX_LIMIT = 2000

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
): Promise<LocationFeatureCollection> {
  const rows = await db.execute<{ fc: LocationFeatureCollection }>(sql`
    with matched as (
      select l.* from ${locations} l
      where l.is_active and l.geog is not null and ${where}
      order by l."machineID", l.id
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
            )
          )
          order by p."machineID", p.id
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
  const kinds = sql.join(types.map((t) => sql`${t}`), sql`, `)
  return queryFeatures(
    db,
    sql`l.geog::geometry && ST_MakeEnvelope(${west}, ${south}, ${east}, ${north}, 4326)
      and l.kind in (${kinds})`,
    limit,
  )
}
