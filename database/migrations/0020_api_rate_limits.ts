/**
 * The API's rate-limit buckets (#199), one row per rule and client
 * ("locations:203.0.113.7", "geocode:2001:db8:1:2::/64"), shared by every
 * server instance. src/server/adapters/rate-limiter/postgres.ts reads and
 * writes them; rows idle for a day are pruned.
 */
import { sql, type Kysely } from "kysely"

type Db = Kysely<unknown>

export async function up(db: Db): Promise<void> {
  await db.schema
    .createTable("api_rate_limits")
    .addColumn("key", "text", (c) => c.primaryKey())
    .addColumn("tokens", sql`double precision`, (c) => c.notNull())
    .addColumn("allowed", "boolean", (c) => c.notNull())
    .addColumn("updated_at", "timestamptz", (c) => c.notNull().defaultTo(sql`now()`))
    .execute()
  await db.schema.createIndex("api_rate_limits_updated_at_idx").on("api_rate_limits").column("updated_at").execute()
}

export async function down(db: Db): Promise<void> {
  await db.schema.dropTable("api_rate_limits").execute()
}
