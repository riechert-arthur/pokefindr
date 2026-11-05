/**
 * Env and connection helpers shared by drizzle.config.ts and the db:* scripts.
 */
import path from "node:path"
import { loadEnvConfig } from "@next/env"
import postgres from "postgres"

export const ROOT_DIR = path.resolve(__dirname, "../..")

/**
 * Loads .env files the way `next dev` does (.env.development.local, .env.local,
 * .env.development, .env). Never loads .env.production*, so a pulled production
 * URL can't be picked up by accident. Variables already set in the shell win.
 */
export function loadDevEnv() {
  loadEnvConfig(ROOT_DIR, true)
}

/** Migrations need a direct connection; poolers in transaction mode can break DDL. */
export function migrationDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
}

/** One connection for a db:* script, from migrationDatabaseUrl(). The caller closes it with `end()`. */
export function migrationClient(): postgres.Sql {
  const url = migrationDatabaseUrl()
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED)")
  return postgres(url, { max: 1, prepare: false, onnotice: () => {} })
}
