import "server-only"
import { sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import type { LocationFeatureCollection } from "@/lib/types/locations"

/**
 * All active locations as a GeoJSON FeatureCollection, built in one query.
 * Postgres does the JSON assembly, so this stays fast as the table grows.
 */
export async function getActiveLocationsGeoJSON(
  db: Database = getDb(),
): Promise<LocationFeatureCollection> {
  const rows = await db.execute<{ fc: LocationFeatureCollection }>(sql`
    select json_build_object(
      'type', 'FeatureCollection',
      'features', coalesce(json_agg(
        json_build_object(
          'type', 'Feature',
          'id', l.id,
          'geometry', ST_AsGeoJSON(l.geog::geometry, 6)::json,
          'properties', json_build_object(
            'id', l.id,
            'machineID', coalesce(l."machineID", ''),
            'retailer', coalesce(l.retailer, l.name, ''),
            'address', coalesce(l.address, ''),
            'city', coalesce(l.city, ''),
            'state', coalesce(l.state, '')
          )
        )
        order by l."machineID", l.id
      ), '[]'::json)
    ) as fc
    from ${locations} l
    where l.is_active and l.geog is not null
  `)
  return rows[0].fc
}
