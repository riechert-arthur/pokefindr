import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

const migrationsDir = path.resolve(__dirname, "../../drizzle")

describe("migrations", () => {
  // drizzle-kit quotes types it doesn't know; a quoted geography type fails to
  // apply ("type \"geography(point, 4326)\" does not exist"). See src/server/db/geography.ts.
  it.each(readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")))("%s has no quoted geography type", (file) => {
    const sql = readFileSync(path.join(migrationsDir, file), "utf8")
    expect(sql).not.toMatch(/"geography\(/i)
  })
})
