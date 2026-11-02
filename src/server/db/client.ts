import "server-only"
import postgres from "postgres"
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { attachDatabasePool } from "@vercel/functions"
import { getServerConfig } from "@/server/config"
import * as schema from "./schema"

export type Database = PostgresJsDatabase<typeof schema>

// Keep one pool per server instance. The globalThis cache stops dev-mode hot
// reloads from opening a new pool on every edit.
const globalForDb = globalThis as unknown as {
  pokefindrDb?: { client: postgres.Sql; db: Database }
}

export function getDb(): Database {
  if (!globalForDb.pokefindrDb) {
    const config = getServerConfig()
    const client = postgres(config.DATABASE_URL, {
      max: config.DATABASE_POOL_MAX,
      idle_timeout: 20,
      // Required behind transaction-mode poolers (PgBouncer, Supavisor, Neon).
      prepare: false,
    })

    // On Vercel Fluid Compute, release idle connections before the instance
    // is suspended. Harmless no-op elsewhere.
    if (config.VERCEL) attachDatabasePool(client)

    globalForDb.pokefindrDb = { client, db: drizzle(client, { schema }) }
  }
  return globalForDb.pokefindrDb.db
}

/** Closes the pool. For scripts and tests; never needed in request handlers. */
export async function closeDb() {
  await globalForDb.pokefindrDb?.client.end({ timeout: 5 })
  globalForDb.pokefindrDb = undefined
}
