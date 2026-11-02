// Introspects a live database into ./drizzle-introspect (gitignored), so it can
// be diffed against src/server/db/schema before baselining production.
import base from "./drizzle.config"
import { defineConfig } from "drizzle-kit"

export default defineConfig({ ...base, out: "./drizzle-introspect" })
