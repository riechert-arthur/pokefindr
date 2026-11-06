/**
 * Location details that used to live only in src/data/vending_machines_mod.json:
 * address fields, geocoding metadata, the manual-override flag and the
 * active flag (#73). Added to `locations` and to `locations_staging`, where
 * the location import (0002_import_locations) lands rows before merging them.
 *
 * Additive only, so the previous release keeps working while this deploys.
 */
import { sql, type Kysely } from "kysely"

const TABLES = ["locations", "locations_staging"] as const

const COLUMNS = [
  "retailer",
  "address",
  "city",
  "state",
  "postal_code",
  "is_active",
  "source",
  "mapbox_id",
  "geocode_accuracy",
  "match_code",
  "manual_override",
  "raw",
  "updated_at",
]

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema
      .alterTable(table)
      .addColumn("retailer", "text")
      .addColumn("address", "text")
      .addColumn("city", "text")
      .addColumn("state", "text")
      .addColumn("postal_code", "text")
      .addColumn("is_active", "boolean", (c) => c.notNull().defaultTo(true))
      .addColumn("source", "text")
      .addColumn("mapbox_id", "text")
      .addColumn("geocode_accuracy", "text")
      .addColumn("match_code", "jsonb")
      .addColumn("manual_override", "boolean", (c) => c.notNull().defaultTo(false))
      .addColumn("raw", "jsonb")
      .addColumn("updated_at", "timestamptz", (c) => c.defaultTo(sql`now()`))
      .execute()
  }
  await db.schema.createIndex("locations_active_idx").on("locations").column("is_active").execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("locations_active_idx").execute()
  for (const table of TABLES) {
    let alter = db.schema.alterTable(table).dropColumn(COLUMNS[0])
    for (const column of COLUMNS.slice(1)) alter = alter.dropColumn(column)
    await alter.execute()
  }
}
