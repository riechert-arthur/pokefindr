/**
 * Canary locations (#202): `locations.canary` marks a decoy, a made-up
 * vending machine planted so a copied dataset can be traced back here.
 * A canary is an ordinary active location: every public read returns it
 * like any other place, and nothing sends the flag to clients.
 * scripts/canary/plant.ts adds them, made from the real data at the time;
 * the database is the only record of which rows they are.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table locations add column canary boolean not null default false`.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Without the column the decoys couldn't be told apart, so they go first.
  await sql`delete from locations where canary`.execute(db)
  await sql`alter table locations drop column canary`.execute(db)
}
