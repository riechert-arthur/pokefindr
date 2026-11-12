/**
 * Imports from outside sources (#397), starting with OpenStreetMap's card
 * shops (scripts/one-off/import-osm-shops.ts):
 *
 * - `locations.external_id`: the place's id in its source (`node/777464960`
 *   for OSM), unique per source, so a re-run finds the row it wrote before.
 * - `location_import_runs`: one row per applied import that changed anything:
 *   its source, the snapshot's hash, when, and when it was rolled back.
 * - `location_import_changes`: every row a run inserted, updated or
 *   deactivated, with the values before and after, so the run can be rolled
 *   back on its own (`--rollback <run id>`) without restoring a backup.
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await db.schema.alterTable("locations").addColumn("external_id", "text").execute()
  await db.schema
    .createIndex("locations_source_external_id_key")
    .on("locations")
    .columns(["source", "external_id"])
    .unique()
    .where(sql.ref("external_id"), "is not", null)
    .execute()

  await db.schema
    .createTable("location_import_runs")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("source", "text", (c) => c.notNull())
    .addColumn("snapshot_hash", "text", (c) => c.notNull())
    .addColumn("fetched_at", "timestamptz")
    .addColumn("applied_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("counts", "jsonb", (c) => c.notNull())
    .addColumn("rolled_back_at", "timestamptz")
    .execute()
  await db.schema.createIndex("location_import_runs_source_applied_idx").on("location_import_runs").columns(["source", "applied_at"]).execute()

  await db.schema
    .createTable("location_import_changes")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("run_id", "uuid", (c) => c.notNull())
    // No foreign key: a rollback deletes the rows its run inserted, and the log outlives them.
    .addColumn("location_id", "uuid", (c) => c.notNull())
    .addColumn("op", "text", (c) => c.notNull())
    .addColumn("before", "jsonb")
    .addColumn("after", "jsonb", (c) => c.notNull())
    .addForeignKeyConstraint("location_import_changes_run_id_location_import_runs_id_fk", ["run_id"], "location_import_runs", ["id"], (c) => c.onDelete("cascade"))
    .addCheckConstraint("location_import_changes_op_check", sql`op in ('insert', 'update', 'deactivate')`)
    .execute()
  await db.schema.createIndex("location_import_changes_run_idx").on("location_import_changes").column("run_id").execute()
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("location_import_changes").execute()
  await db.schema.dropTable("location_import_runs").execute()
  await db.schema.dropIndex("locations_source_external_id_key").execute()
  await db.schema.alterTable("locations").dropColumn("external_id").execute()
}
