import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { readJournal } from "../../scripts/db/migrations"
import { splitStatements } from "../../scripts/db/migrator"

const migrationsDir = path.resolve(__dirname, "../../drizzle")
const downDir = path.join(migrationsDir, "down")
const sqlFiles = [
  ...readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")),
  ...readdirSync(downDir).filter((f) => f.endsWith(".sql")).map((f) => `down/${f}`),
]

/** Migrations that can't be undone on purpose. Add to this list only with a reason. */
const IRREVERSIBLE = new Set([
  "0000_baseline", // undoing it would drop every table; recreate a local database instead
])

describe("migrations", () => {
  // drizzle-kit quotes types it doesn't know; a quoted geography type fails to
  // apply ("type \"geography(point, 4326)\" does not exist"). See src/server/db/geography.ts.
  it.each(sqlFiles)("%s has no quoted geography type", (file) => {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8")
    expect(sql).not.toMatch(/"geography\(/i)
  })

  it.each(readJournal().map((e) => e.tag))("%s has a down file, or is listed as irreversible", (tag) => {
    expect(existsSync(path.join(downDir, `${tag}.sql`)) || IRREVERSIBLE.has(tag)).toBe(true)
  })

  it("every down file belongs to a migration in the journal", () => {
    const tags = new Set(readJournal().map((e) => e.tag))
    const orphans = readdirSync(downDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.slice(0, -".sql".length))
      .filter((tag) => !tags.has(tag))
    expect(orphans).toEqual([])
  })
})

describe("splitStatements", () => {
  it("splits on drizzle-kit breakpoints and drops comment-only chunks", () => {
    expect(splitStatements("-- header\ncreate table a (id int);--> statement-breakpoint\n\ndrop table b;\n--> statement-breakpoint\n-- trailing note\n")).toEqual([
      "-- header\ncreate table a (id int);",
      "drop table b;",
    ])
  })
})
