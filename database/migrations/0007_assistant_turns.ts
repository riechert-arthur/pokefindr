/**
 * A log of assistant turns (#212): who asked, how it ended, which tools it
 * ran (names only), tokens, cost, latency and review flags, one row per
 * turn. Everything the user typed or the model wrote (the question, the
 * answer, the tools' inputs and errors) sits in assistant_turn_texts,
 * deleted after 30 days (the assistant-retention job) or when the user
 * clears their history; the turn rows are kept longer, without any text,
 * for cost and abuse tracking.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("assistant_turns")
    .addColumn("id", "uuid", (c) => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("user_id", "uuid", (c) => c.notNull())
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("outcome", "text", (c) => c.notNull())
    .addColumn("model", "text")
    .addColumn("input_tokens", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("output_tokens", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("cache_read_tokens", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("cache_write_tokens", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("cost_micros", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("latency_ms", "integer")
    .addColumn("tools", "jsonb", (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    // No default: drizzle-kit can't compare array defaults (db:check). Inserts always set it.
    .addColumn("flags", sql`text[]`, (c) => c.notNull())
    // Named as Drizzle names it, so db:check matches.
    .addForeignKeyConstraint("assistant_turns_user_id_profiles_id_fk", ["user_id"], "profiles", ["id"], (c) => c.onDelete("cascade"))
    .addCheckConstraint(
      "assistant_turns_outcome_check",
      sql`outcome in ('answered', 'refused', 'tool_limit', 'max_tokens', 'error', 'stopped', 'limited', 'paused')`,
    )
    .execute()
  await db.schema.createIndex("assistant_turns_user_created_idx").on("assistant_turns").columns(["user_id", "created_at"]).execute()
  await db.schema.createIndex("assistant_turns_created_idx").on("assistant_turns").column("created_at").execute()

  await db.schema
    .createTable("assistant_turn_texts")
    .addColumn("turn_id", "uuid", (c) => c.primaryKey())
    .addColumn("question", "text", (c) => c.notNull())
    .addColumn("answer", "text", (c) => c.notNull().defaultTo(""))
    .addColumn("tool_calls", "jsonb", (c) => c.notNull().defaultTo(sql`'[]'::jsonb`))
    .addColumn("created_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint("assistant_turn_texts_turn_id_assistant_turns_id_fk", ["turn_id"], "assistant_turns", ["id"], (c) => c.onDelete("cascade"))
    .execute()
  await db.schema.createIndex("assistant_turn_texts_created_idx").on("assistant_turn_texts").column("created_at").execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("assistant_turn_texts").execute()
  await db.schema.dropTable("assistant_turns").execute()
}
