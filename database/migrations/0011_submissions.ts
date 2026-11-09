/**
 * Self-service submissions (#123): people add card shops and events, and a
 * moderator approves or rejects them.
 *
 * - `location_submissions`: what was sent (`payload`, checked per kind by the
 *   API), where (`geog`), by whom, and the decision. Approving one creates a
 *   `locations` row and points `location_id` at it.
 * - One details table per kind, keyed by `location_id`: `card_shop_details`
 *   and `event_details`. Each has a `kind` column fixed to its kind and a
 *   foreign key on (location_id, kind), so a details row can only belong to a
 *   location of the matching kind. `locations` gets a unique (id, kind) for
 *   that key to point at.
 * - Event times live in `event_details`. Highlights at an event location take
 *   their times from it; this copies the times of any existing ones over.
 *   Highlights with their own point (no location) keep `starts_at`.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table locations add constraint locations_id_kind_key unique (id, kind)`.execute(db)

  await db.schema
    .createTable("location_submissions")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("kind", "text", (c) => c.notNull())
    .addColumn("payload", "jsonb", (c) => c.notNull())
    .addColumn("geog", sql`geography(point, 4326)`, (c) => c.notNull())
    .addColumn("submitted_by", "uuid", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull().defaultTo("pending"))
    .addColumn("reject_reason", "text")
    .addColumn("reviewed_by", "uuid")
    .addColumn("reviewed_at", "timestamptz")
    .addColumn("location_id", "uuid")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    // Named as Drizzle names them, so db:check matches.
    .addForeignKeyConstraint("location_submissions_submitted_by_profiles_id_fk", ["submitted_by"], "profiles", ["id"], (c) => c.onDelete("cascade"))
    .addForeignKeyConstraint("location_submissions_reviewed_by_profiles_id_fk", ["reviewed_by"], "profiles", ["id"], (c) => c.onDelete("set null"))
    .addForeignKeyConstraint("location_submissions_location_id_locations_id_fk", ["location_id"], "locations", ["id"], (c) => c.onDelete("set null"))
    .addCheckConstraint("location_submissions_kind_check", sql`kind in ('shop', 'event')`)
    .addCheckConstraint("location_submissions_status_check", sql`status in ('pending', 'approved', 'rejected')`)
    .addCheckConstraint("location_submissions_reject_reason_check", sql`reject_reason in ('duplicate', 'not_real', 'wrong_details', 'spam')`)
    .addCheckConstraint("location_submissions_rejected_reason_check", sql`(status = 'rejected') = (reject_reason is not null)`)
    .execute()
  // My submissions and the daily limit; the queue (oldest pending first); the duplicate check.
  await db.schema.createIndex("location_submissions_submitted_by_created_idx").on("location_submissions").columns(["submitted_by", "created_at"]).execute()
  await db.schema.createIndex("location_submissions_status_created_idx").on("location_submissions").columns(["status", "created_at"]).execute()
  await sql`create index location_submissions_geog_gist on location_submissions using gist (geog)`.execute(db)

  await db.schema
    .createTable("card_shop_details")
    .addColumn("location_id", "uuid", (c) => c.primaryKey())
    .addColumn("kind", "text", (c) => c.notNull().defaultTo("shop"))
    .addColumn("website", "text")
    .addColumn("hours", "text")
    .addColumn("sells", sql`text[]`, (c) => c.notNull())
    .addForeignKeyConstraint("card_shop_details_location_fk", ["location_id", "kind"], "locations", ["id", "kind"], (c) => c.onDelete("cascade"))
    .addCheckConstraint("card_shop_details_kind_check", sql`kind = 'shop'`)
    .execute()

  await db.schema
    .createTable("event_details")
    .addColumn("location_id", "uuid", (c) => c.primaryKey())
    .addColumn("kind", "text", (c) => c.notNull().defaultTo("event"))
    .addColumn("starts_at", "timestamptz", (c) => c.notNull())
    .addColumn("ends_at", "timestamptz")
    .addColumn("venue", "text")
    .addColumn("link", "text")
    .addColumn("is_free", "boolean")
    .addForeignKeyConstraint("event_details_location_fk", ["location_id", "kind"], "locations", ["id", "kind"], (c) => c.onDelete("cascade"))
    .addCheckConstraint("event_details_kind_check", sql`kind = 'event'`)
    .addCheckConstraint("event_details_dates_check", sql`ends_at is null or ends_at >= starts_at`)
    .execute()
  // Upcoming events and the expire-events job look events up by when they start and end.
  await db.schema.createIndex("event_details_starts_at_idx").on("event_details").column("starts_at").execute()
  await db.schema.createIndex("event_details_ends_at_idx").on("event_details").column("ends_at").execute()

  // Event highlights at an event location: their times move to event_details.
  // Published ones only (an unpublished one would put its event in the
  // upcoming list), and where a location has several, the one that ends
  // last, so a past one can't hide an upcoming one.
  await sql`
    insert into event_details (location_id, starts_at, ends_at)
    select distinct on (h.location_id) h.location_id, h.starts_at, h.ends_at
    from highlights h join locations l on l.id = h.location_id and l.kind = 'event'
    where h.kind = 'event' and h.is_published and h.starts_at is not null
    order by h.location_id, coalesce(h.ends_at, h.starts_at + interval '1 day') desc
    on conflict (location_id) do nothing
  `.execute(db)
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("event_details").execute()
  await db.schema.dropTable("card_shop_details").execute()
  await db.schema.dropTable("location_submissions").execute()
  await sql`alter table locations drop constraint locations_id_kind_key`.execute(db)
}
