/**
 * Thumbs up or down on assistant answers (#213):
 *
 * - `assistant_feedback`: one vote per turn (the viewer can change it), with
 *   an optional reason and comment on a thumbs down. The comment is text
 *   someone wrote, so it follows the turn text's 30-day retention.
 * - `assistant_turns.prompt_version`: which system prompt and tools answered,
 *   so the thumbs-up rate can be compared across prompt and model changes.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("assistant_turns").addColumn("prompt_version", "text").execute()
  await db.schema
    .createTable("assistant_feedback")
    .addColumn("turn_id", "uuid", (c) => c.primaryKey())
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("vote", "smallint", (c) => c.notNull())
    .addColumn("reason", "text")
    .addColumn("comment", "text")
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    // Named as Drizzle names them, so db:check matches.
    .addForeignKeyConstraint("assistant_feedback_turn_id_assistant_turns_id_fk", ["turn_id"], "assistant_turns", ["id"], (c) => c.onDelete("cascade"))
    .addForeignKeyConstraint("assistant_feedback_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (c) => c.onDelete("cascade"))
    .addCheckConstraint("assistant_feedback_vote_check", sql`vote in (-1, 1)`)
    .addCheckConstraint("assistant_feedback_reason_check", sql`reason in ('wrong_place', 'outdated', 'misunderstood', 'other')`)
    .execute()
  await db.schema.createIndex("assistant_feedback_created_idx").on("assistant_feedback").column("created_at").execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("assistant_feedback").execute()
  await db.schema.alterTable("assistant_turns").dropColumn("prompt_version").execute()
}
