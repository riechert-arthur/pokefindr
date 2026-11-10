/**
 * Content moderation for reviews (#253, docs/moderation.md):
 *
 * - `location_ratings.status`: `published` (everyone sees it), `held`
 *   (waiting for a moderator; only its author sees it, as "pending review")
 *   or `removed` (a moderator took it down; only its author sees it).
 *   Existing reviews are published. `moderated_by` / `moderated_at` say who
 *   approved or removed it, for the undo window.
 * - `review_moderation_checks`: every automatic check of a review's text:
 *   the verdict, categories, the model's reason, which model and prompt,
 *   whether the check failed (an outage holds the review, and a job checks
 *   it again), and what it cost.
 * - `location_submissions.text_check`: the same check on a submission's
 *   name, notes and links, shown to moderators in the review queue.
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await db.schema
    .alterTable("location_ratings")
    .addColumn("status", "text", (c) => c.notNull().defaultTo("published"))
    .addColumn("moderated_by", "uuid", (c) => c.references("profiles.id").onDelete("set null"))
    .addColumn("moderated_at", "timestamptz")
    .execute()
  // Drizzle's name for the reference.
  await sql`alter table location_ratings rename constraint location_ratings_moderated_by_fkey to location_ratings_moderated_by_profiles_id_fk`.execute(db)
  await db.schema.alterTable("location_ratings").addCheckConstraint("location_ratings_status_check", sql`status in ('published', 'held', 'removed')`).execute()
  // The held-reviews queue, oldest first.
  await db.schema
    .createIndex("location_ratings_held_created_idx")
    .on("location_ratings")
    .column("created_at")
    .where(sql.ref("status"), "=", "held")
    .execute()

  await db.schema
    .createTable("review_moderation_checks")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("rating_id", "uuid", (c) => c.notNull())
    .addColumn("verdict", "text", (c) => c.notNull())
    .addColumn("categories", sql`text[]`, (c) => c.notNull())
    .addColumn("reason", "text", (c) => c.notNull())
    .addColumn("model", "text", (c) => c.notNull())
    .addColumn("prompt_version", "text", (c) => c.notNull())
    .addColumn("failed", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("cost_micros", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("review_moderation_checks_rating_id_location_ratings_id_fk", ["rating_id"], "location_ratings", ["id"], (c) => c.onDelete("cascade"))
    .addCheckConstraint("review_moderation_checks_verdict_check", sql`verdict in ('allow', 'hold', 'block')`)
    .execute()
  await db.schema.createIndex("review_moderation_checks_rating_created_idx").on("review_moderation_checks").columns(["rating_id", "created_at"]).execute()

  await db.schema.alterTable("location_submissions").addColumn("text_check", "jsonb").execute()
}

export async function down(db: Db): Promise<void> {
  await db.schema.alterTable("location_submissions").dropColumn("text_check").execute()
  await db.schema.dropTable("review_moderation_checks").execute()
  await db.schema.dropIndex("location_ratings_held_created_idx").execute()
  await db.schema.alterTable("location_ratings").dropConstraint("location_ratings_status_check").execute()
  await db.schema.alterTable("location_ratings").dropColumn("moderated_at").dropColumn("moderated_by").dropColumn("status").execute()
}
