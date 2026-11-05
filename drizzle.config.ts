import { defineConfig } from "drizzle-kit"
import { loadDevEnv, migrationDatabaseUrl } from "./scripts/db/env"

// Load .env files the way `next dev` does (never .env.production*).
loadDevEnv()

// drizzle-kit is only used for `db:pull`, `db:studio` and the drift check.
// Migrations are written by hand with Kysely in database/migrations.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  // `npm run db:pull` writes here (gitignored), to diff a live database
  // against src/server/db/schema.
  out: "./drizzle-introspect",
  dbCredentials: { url: migrationDatabaseUrl() ?? "" },
  // Only manage our own schema; ignore PostGIS's spatial_ref_sys and Supabase internals.
  schemaFilter: ["public"],
  tablesFilter: ["!spatial_ref_sys"],
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
})
