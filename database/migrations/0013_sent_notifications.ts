/**
 * Emails the app has sent for an event, so a retried job doesn't send one
 * twice (#127). `key` names the event and the recipient, e.g.
 * `submission-created:<submission>:<moderator>`. A job claims the key, sends,
 * and gives the key back if the send fails, so the retry sends it.
 */
import { sql, type Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("sent_notifications")
    .addColumn("key", "text", (c) => c.primaryKey())
    .addColumn("sent_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex("sent_notifications_sent_at_idx").on("sent_notifications").column("sent_at").execute()
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("sent_notifications").execute()
}
