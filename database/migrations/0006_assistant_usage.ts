/**
 * The assistant's daily usage (#209, #211), for its limits and spend caps:
 *
 * - `assistant_usage`: per user and UTC day, the messages sent and the tokens
 *   and cost (in millionths of a dollar) they used. Summed by day for the
 *   global spend ceiling.
 * - `assistant_place_views`: the distinct places the assistant showed each
 *   user each day, so it can't be used to page through the whole data set.
 *
 * Old days can be deleted at any time; only today's rows are read.
 */
import type { Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("assistant_usage")
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("day", "date", (c) => c.notNull())
    .addColumn("messages", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("input_tokens", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("output_tokens", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("cost_micros", "integer", (c) => c.notNull().defaultTo(0))
    // Named as Drizzle names it, so db:check matches.
    .addForeignKeyConstraint("assistant_usage_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (c) => c.onDelete("cascade"))
    .execute()
  // A unique index, not a composite primary key: drizzle-kit can't read those back (db:check).
  await db.schema.createIndex("assistant_usage_user_day_key").unique().on("assistant_usage").columns(["user_id", "day"]).execute()
  await db.schema.createIndex("assistant_usage_day_idx").on("assistant_usage").column("day").execute()

  await db.schema
    .createTable("assistant_place_views")
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("day", "date", (c) => c.notNull())
    .addColumn("location_id", "uuid", (c) => c.notNull())
    .addForeignKeyConstraint("assistant_place_views_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (c) => c.onDelete("cascade"))
    .addForeignKeyConstraint("assistant_place_views_location_id_locations_id_fk", ["location_id"], "locations", ["id"], (c) => c.onDelete("cascade"))
    .execute()
  await db.schema
    .createIndex("assistant_place_views_user_day_location_key")
    .unique()
    .on("assistant_place_views")
    .columns(["user_id", "day", "location_id"])
    .execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("assistant_place_views").execute()
  await db.schema.dropTable("assistant_usage").execute()
}
