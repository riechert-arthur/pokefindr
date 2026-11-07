/**
 * Location counts per country, region (US state) and kind, for the zoomed-out
 * map's state shading (#102). One row per (country, region, kind) with at
 * least one active, positioned location; region is '' when a row has no state.
 *
 * A materialized view, so the map's aggregate request never scans
 * `locations`. The `refresh-region-counts` job refreshes it after imports and
 * nightly. The unique index lets that refresh run CONCURRENTLY, so reads never
 * wait on it.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create materialized view location_region_counts as
    select country_code as country, coalesce(state, '') as region, kind, count(*)::integer as count
    from locations
    where is_active and geog is not null
    group by country_code, coalesce(state, ''), kind
  `.execute(db)
  await sql`
    create unique index location_region_counts_key
    on location_region_counts (country, region, kind)
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop materialized view location_region_counts`.execute(db)
}
