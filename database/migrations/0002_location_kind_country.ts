/**
 * What kind of place a location is, and which country it's in (#101, #102).
 *
 * - `kind`: vending, shop or event. Every existing row is a vending machine,
 *   so the default fills them in. The map's types filter reads it.
 * - `country_code`: ISO 3166-1 alpha-2. Every existing row is in the US.
 *   Region counts group by country, then `state` (the admin region).
 *
 * Added to `locations` and `locations_staging`, which keeps the same columns.
 *
 * Also a GiST index on `geog::geometry` for the map's viewport query. The
 * query filters with planar `&&` on geometry: on geography, `&&` compares
 * boxes on the sphere, whose edges bow out, so it returned points well
 * outside the requested box and missed some inside it.
 * Additive with defaults, so the previous release keeps working while this
 * deploys.
 */
import { sql, type Kysely } from "kysely"

const TABLES = ["locations", "locations_staging"] as const

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await sql`
      alter table ${sql.table(table)}
        add column kind text not null default 'vending',
        add column country_code text not null default 'US',
        add constraint ${sql.id(`${table}_kind_check`)} check (kind in ('vending', 'shop', 'event')),
        add constraint ${sql.id(`${table}_country_code_check`)} check (country_code ~ '^[A-Z]{2}$')
    `.execute(db)
  }
  await sql`create index locations_geog_geometry_gist on locations using gist ((geog::geometry))`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index locations_geog_geometry_gist`.execute(db)
  for (const table of TABLES) {
    // Dropping the columns drops their check constraints too.
    await sql`alter table ${sql.table(table)} drop column country_code, drop column kind`.execute(db)
  }
}
