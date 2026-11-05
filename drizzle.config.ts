import { defineConfig } from "drizzle-kit"
import { loadDevEnv, migrationDatabaseUrl } from "./scripts/db/migrations"

// Load .env files the way `next dev` does (never .env.production*).
loadDevEnv()

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: migrationDatabaseUrl() ?? "" },
  // Only manage our own schema; ignore PostGIS's spatial_ref_sys and Supabase internals.
  schemaFilter: ["public"],
  tablesFilter: ["!spatial_ref_sys"],
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
})
