/**
 * Env helpers shared by drizzle.config.ts and the db:* scripts.
 */
import path from "node:path"
import { loadEnvConfig } from "@next/env"

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
