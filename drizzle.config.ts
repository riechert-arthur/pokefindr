import { defineConfig } from "drizzle-kit"
import { loadEnvConfig } from "@next/env"

// Load .env / .env.local the same way `next dev` does.
loadEnvConfig(process.cwd())

// Migrations need a direct connection; poolers in transaction mode can break DDL.
const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url: url ?? "" },
  // Only manage our own schema; ignore PostGIS's spatial_ref_sys and Supabase internals.
  schemaFilter: ["public"],
  tablesFilter: ["!spatial_ref_sys"],
  extensionsFilters: ["postgis"],
  strict: true,
  verbose: true,
})
