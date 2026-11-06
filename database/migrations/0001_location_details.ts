/**
 * Location details that used to live only in src/data/vending_machines_mod.json:
 * address fields, geocoding metadata, the manual-override flag and the
 * active flag (#73). Added to `locations` and to `locations_staging`, where
 * the location import (0002_import_locations) lands rows before merging them.
 *
 * Additive only, so the previous release keeps working while this deploys.
 */
import { sql, type ColumnDataType, type ColumnDefinitionBuilder, type Kysely } from "kysely"

const TABLES = ["locations", "locations_staging"] as const

/** Every column this migration adds, in one list so up() and down() can't drift apart. */
const COLUMNS: [name: string, type: ColumnDataType, build?: (c: ColumnDefinitionBuilder) => ColumnDefinitionBuilder][] = [
  ["retailer", "text"],
  ["address", "text"],
  ["city", "text"],
  ["state", "text"],
  ["postal_code", "text"],
  ["is_active", "boolean", (c) => c.notNull().defaultTo(true)],
  ["source", "text"],
  ["mapbox_id", "text"],
  ["geocode_accuracy", "text"],
  ["match_code", "jsonb"],
  ["manual_override", "boolean", (c) => c.notNull().defaultTo(false)],
  ["raw", "jsonb"],
  ["updated_at", "timestamptz", (c) => c.defaultTo(sql`now()`)],
]

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    const [first, ...rest] = COLUMNS
    let alter = db.schema.alterTable(table).addColumn(...first)
    for (const column of rest) alter = alter.addColumn(...column)
    await alter.execute()
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    const [first, ...rest] = COLUMNS.map(([name]) => name)
    let alter = db.schema.alterTable(table).dropColumn(first)
    for (const name of rest) alter = alter.dropColumn(name)
    await alter.execute()
  }
}
