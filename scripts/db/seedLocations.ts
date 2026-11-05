import { readFileSync } from "node:fs"
import path from "node:path"
import type postgres from "postgres"
import { ROOT_DIR } from "./env"

// A type alias (not an interface) so it's assignable to postgres.js's JSON type.
export type SeedLocation = {
  machineID: string
  name: string
  description: string
  longitude: number
  latitude: number
}

export const SEED_FILE = path.join(ROOT_DIR, "database/seeds/locations.json")

export function readSeedLocations(file = SEED_FILE): SeedLocation[] {
  return JSON.parse(readFileSync(file, "utf8"))
}

/**
 * Upserts locations by "machineID". Rows whose values already match aren't
 * rewritten, so running it twice changes nothing the second time.
 */
export async function seedLocations(sql: postgres.Sql, rows: SeedLocation[]) {
  const changed = await sql<{ inserted: boolean }[]>`
    insert into locations ("machineID", name, description, is_official, geog)
    select r."machineID", r.name, r.description, true,
           st_setsrid(st_makepoint(r.longitude, r.latitude), 4326)::geography
    from jsonb_to_recordset(${sql.json(rows)})
      as r("machineID" text, name text, description text, longitude float8, latitude float8)
    on conflict ("machineID") do update
      set name = excluded.name, description = excluded.description,
          is_official = excluded.is_official, geog = excluded.geog
      where (locations.name, locations.description, locations.is_official, locations.geog::text)
        is distinct from (excluded.name, excluded.description, excluded.is_official, excluded.geog::text)
    returning (xmax = 0) as inserted`

  const added = changed.filter((r) => r.inserted).length
  return { added, updated: changed.length - added, unchanged: rows.length - changed.length }
}
