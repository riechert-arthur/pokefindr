/**
 * Canary locations (#202): `locations.canary` marks a decoy, a made-up
 * machine that only the map's bulk viewport request returns, so a copied
 * dataset can be traced back here. scripts/canary/plant.ts adds them from a
 * secret seed; the decoys themselves are never committed.
 *
 * A canary is always inactive, so every query that keeps to active
 * locations (lists, search, details, counts, the region counts view) leaves
 * it out without knowing about canaries. Only getLocationsInBbox asks for
 * them. The check keeps a canary from being switched on by mistake.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table locations
      add column canary boolean not null default false,
      add constraint locations_canary_check check (not (canary and is_active))
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Dropping the column drops its check too. The decoys go with it.
  await sql`delete from locations where canary`.execute(db)
  await sql`alter table locations drop column canary`.execute(db)
}
