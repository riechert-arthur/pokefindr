/**
 * Highlights for the zoomed-out map (#114): featured events (a card show, a
 * league night) and other places worth a look, shown as markers and in the
 * "Across the US" panel. Hotspots aren't stored; they're computed from
 * `locations` (src/server/services/highlights.ts).
 *
 * A highlight is at a location (`location_id`) or at its own point (`geog`),
 * with a city and state for its label. Deleting a location deletes the
 * highlights at it (set null would break the place check). `is_sample` marks invented rows
 * (local seeds), which the UI labels "Sample".
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("highlights")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("kind", "text", (c) => c.notNull())
    .addColumn("title", "text", (c) => c.notNull())
    .addColumn("description", "text")
    .addColumn("starts_at", "timestamptz")
    .addColumn("ends_at", "timestamptz")
    .addColumn("location_id", "uuid")
    .addColumn("geog", sql`geography(point, 4326)`)
    .addColumn("city", "text")
    .addColumn("state", "text")
    .addColumn("is_published", "boolean", (c) => c.notNull().defaultTo(true))
    .addColumn("is_sample", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    // Named as Drizzle names it, so db:check matches.
    .addForeignKeyConstraint("highlights_location_id_locations_id_fk", ["location_id"], "locations", ["id"], (c) => c.onDelete("cascade"))
    .addCheckConstraint("highlights_kind_check", sql`kind in ('event', 'featured')`)
    .addCheckConstraint("highlights_place_check", sql`location_id is not null or geog is not null`)
    .addCheckConstraint("highlights_dates_check", sql`ends_at is null or starts_at is null or ends_at >= starts_at`)
    .addCheckConstraint("highlights_event_starts_check", sql`kind <> 'event' or starts_at is not null`)
    .execute()
  await db.schema.createIndex("highlights_starts_at_idx").on("highlights").column("starts_at").execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("highlights").execute()
}
