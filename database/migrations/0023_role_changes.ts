/**
 * `role_changes` (#294): every role change made in User management, who
 * changed whose role, from what, to what and when. Modelled on
 * `report_actions` (migration 0015). The actor is kept as null if their
 * profile is deleted; the row goes with the person whose role changed.
 */
import { sql, type Kysely } from "kysely"

const ROLES = sql`('member', 'moderator', 'admin', 'super_admin')`

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("role_changes")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("changed_by", "uuid")
    .addColumn("from_role", "text", (c) => c.notNull())
    .addColumn("to_role", "text", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("role_changes_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (c) => c.onDelete("cascade"))
    .addForeignKeyConstraint("role_changes_changed_by_profiles_id_fk", ["changed_by"], "profiles", ["id"], (c) => c.onDelete("set null"))
    .addCheckConstraint("role_changes_from_role_check", sql`from_role in ${ROLES}`)
    .addCheckConstraint("role_changes_to_role_check", sql`to_role in ${ROLES}`)
    .execute()
  await db.schema.createIndex("role_changes_user_created_idx").on("role_changes").columns(["user_id", "created_at"]).execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("role_changes").execute()
}
