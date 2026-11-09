/**
 * Sponsored placement switches (#159): an admin turns a placement off (the
 * map's results list, location details, the landing strip) without a
 * deploy. A placement without a row is on.
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("ad_placements")
    .addColumn("placement", "text", (c) => c.primaryKey())
    .addColumn("enabled", "boolean", (c) => c.notNull())
    .addColumn("updated_by", "uuid")
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("ad_placements_updated_by_profiles_id_fk", ["updated_by"], "profiles", ["id"], (c) => c.onDelete("set null"))
    .addCheckConstraint("ad_placements_placement_check", sql`placement in ('results', 'details', 'landing')`)
    .execute()
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("ad_placements").execute()
}
