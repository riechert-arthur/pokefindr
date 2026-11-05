import { readdirSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { MIGRATION_FILE, MIGRATIONS_DIR } from "../../scripts/db/migrator"

const DATABASE_DIR = path.resolve(__dirname, "../../database")
const files = readdirSync(MIGRATIONS_DIR)

/** Migrations that can't be undone on purpose. Add to this list only with a reason. */
const IRREVERSIBLE = new Set([
  "0000_baseline", // undoing it would drop every table; recreate a local database instead
])

describe("migrations", () => {
  it("are all Kysely TypeScript files named NNNN_description.ts", () => {
    expect(files.filter((f) => !MIGRATION_FILE.test(f))).toEqual([])
  })

  it("have no raw .sql files anywhere in database/", () => {
    const sqlFiles = readdirSync(DATABASE_DIR, { recursive: true, encoding: "utf8" }).filter((f) => f.endsWith(".sql"))
    expect(sqlFiles).toEqual([])
  })

  it.each(files)("%s exports up(), and down() unless listed as irreversible", async (file) => {
    const mod = await import(path.join(MIGRATIONS_DIR, file))
    const name = file.slice(0, -".ts".length)
    expect(typeof mod.up).toBe("function")
    expect(typeof mod.down === "function" || IRREVERSIBLE.has(name)).toBe(true)
  })
})
