/**
 * Data: copies the machines in src/data/vending_machines_mod.json into
 * `locations` (#73), using scripts/one-off/import-locations.ts. Runs inside the
 * migration transaction, so a failed verification rolls back the whole run.
 *
 * Idempotent. Upserts on "machineID" and writes only changed rows, so running
 * it again changes nothing; to pick up later edits to the JSON, run
 * `npm run db:import-locations -- --apply`.
 *
 * Does nothing once the JSON is gone (#80). Keep scripts/one-off/import-locations.ts
 * as long as this file imports it, or make up() a no-op when deleting both.
 */
import { existsSync } from "node:fs"
import type { Kysely } from "kysely"
import { DEFAULT_FILE, importLocations, summarize } from "../../scripts/one-off/import-locations"

export async function up(db: Kysely<unknown>): Promise<void> {
  if (!existsSync(DEFAULT_FILE)) {
    console.log("0002_import_locations: no location JSON; nothing to import.")
    return
  }
  const report = await importLocations(db)
  for (const line of summarize(report)) console.log(line)
}

/** Leaves the rows: deleting locations would also delete their reviews (on delete cascade). */
export async function down(): Promise<void> {}
