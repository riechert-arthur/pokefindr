/**
 * Emails the app sends for an event, so a retried job doesn't send one
 * twice (#127). `key` names the event and the recipient, e.g.
 * `submission-created:<submission>:<moderator>`.
 *
 * A job claims the key (`claimed_at`), sends, then sets `sent_at`. If the
 * send fails it gives the key back, so the retry sends. If the run dies
 * mid-send, the claim has no `sent_at`; once it's older than the longest a
 * send can take, the next run may claim it again.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("sent_notifications")
    .addColumn("key", "text", (c) => c.primaryKey())
    .addColumn("claimed_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .addColumn("sent_at", "timestamptz")
    .execute()
  await db.schema.createIndex("sent_notifications_claimed_at_idx").on("sent_notifications").column("claimed_at").execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("sent_notifications").execute()
}
