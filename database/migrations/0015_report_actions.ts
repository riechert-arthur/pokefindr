/**
 * Acting on reported locations (#153):
 *
 * - `locations.hidden_at`, `hidden_by`: an admin took the location off the
 *   map. Hidden rows are also `is_active = false`, so every map, search and
 *   count query drops them as they are; `hidden_at` is what tells the
 *   location import to keep a hidden machine hidden, and Reopen to bring it
 *   back.
 * - `status_reports.resolved_at`, `resolved_by`, `resolution`: a report is
 *   open until someone dismisses it, marks it fixed or hides its location.
 * - `report_actions`: every action on a location's reports (dismiss, fix,
 *   hide, reopen), who and when, so the history stays after a reopen.
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("locations")
    .addColumn("hidden_at", "timestamptz")
    .addColumn("hidden_by", "uuid", (c) => c.references("profiles.id").onDelete("set null"))
    .execute()
  // Drizzle's name for the reference.
  await sql`alter table locations rename constraint locations_hidden_by_fkey to locations_hidden_by_profiles_id_fk`.execute(db)

  await db.schema
    .alterTable("status_reports")
    .addColumn("resolved_at", "timestamptz")
    .addColumn("resolved_by", "uuid", (c) => c.references("profiles.id").onDelete("set null"))
    .addColumn("resolution", "text")
    .execute()
  await db.schema.alterTable("status_reports").addCheckConstraint("status_reports_resolution_check", sql`resolution in ('dismissed', 'fixed', 'hidden')`).execute()
  await db.schema.alterTable("status_reports").addCheckConstraint("status_reports_resolved_check", sql`(resolved_at is null) = (resolution is null)`).execute()
  await sql`alter table status_reports rename constraint status_reports_resolved_by_fkey to status_reports_resolved_by_profiles_id_fk`.execute(db)
  // The open reports of a location: what the reports page and the counts read.
  await db.schema
    .createIndex("status_reports_open_location_idx")
    .on("status_reports")
    .column("location_id")
    .where(sql.ref("resolved_at"), "is", null)
    .execute()

  await db.schema
    .createTable("report_actions")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("location_id", "uuid", (c) => c.notNull())
    .addColumn("action", "text", (c) => c.notNull())
    .addColumn("acted_by", "uuid")
    .addColumn("reports", "integer", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("report_actions_location_id_locations_id_fk", ["location_id"], "locations", ["id"], (c) => c.onDelete("cascade"))
    .addForeignKeyConstraint("report_actions_acted_by_profiles_id_fk", ["acted_by"], "profiles", ["id"], (c) => c.onDelete("set null"))
    .addCheckConstraint("report_actions_action_check", sql`action in ('dismiss', 'fix', 'hide', 'reopen')`)
    .execute()
  await db.schema.createIndex("report_actions_location_created_idx").on("report_actions").columns(["location_id", "created_at"]).execute()
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("report_actions").execute()
  await db.schema.dropIndex("status_reports_open_location_idx").execute()
  await db.schema.alterTable("status_reports").dropConstraint("status_reports_resolution_check").execute()
  await db.schema.alterTable("status_reports").dropConstraint("status_reports_resolved_check").execute()
  await db.schema.alterTable("status_reports").dropColumn("resolution").dropColumn("resolved_by").dropColumn("resolved_at").execute()
  await db.schema.alterTable("locations").dropColumn("hidden_by").dropColumn("hidden_at").execute()
}
