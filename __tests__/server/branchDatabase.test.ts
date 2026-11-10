import { describe, expect, it } from "vitest"
import { staleReasons } from "../../scripts/db/branchDatabase"
import { migrationHash } from "../../scripts/db/migrator"

describe("staleReasons", () => {
  const files = new Map([
    ["0000_baseline", "aaa"],
    ["0001_change", "bbb"],
  ])

  it("is empty when every applied migration still matches its file", () => {
    expect(staleReasons(new Map(), files)).toEqual([])
    expect(staleReasons(new Map([["0000_baseline", "aaa"], ["0001_change", "bbb"]]), files)).toEqual([])
  })

  it("ignores pending migrations and ones applied before hashes were kept", () => {
    expect(staleReasons(new Map([["0000_baseline", null]]), files)).toEqual([])
  })

  it("notices a migration that changed after it was applied", () => {
    expect(staleReasons(new Map([["0000_baseline", "aaa"], ["0001_change", "old"]]), files)).toEqual([
      "0001_change has changed since it was applied",
    ])
  })

  it("notices an applied migration the branch doesn't have (renamed, removed, or newer on main)", () => {
    expect(staleReasons(new Map([["0001_renamed", null]]), files)).toEqual([
      "0001_renamed was applied but isn't on this branch",
    ])
  })
})

describe("migrationHash", () => {
  const source = `import type { Kysely } from "kysely"

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("profiles").addColumn("nickname", "text").execute()
}
`

  it("ignores comments, formatting, types and line endings", () => {
    const reworded = `// Adds nicknames.
import type { Kysely } from "kysely"

/** Why: people asked. */
export async function up(db: Kysely<any>) {
  await db.schema
    .alterTable("profiles")
    .addColumn("nickname", "text")
    .execute()
}
`
    expect(migrationHash(reworded)).toBe(migrationHash(source))
    expect(migrationHash(source.replace(/\n/g, "\r\n"))).toBe(migrationHash(source))
  })

  it("changes when the code does", () => {
    expect(migrationHash(source.replace('"nickname"', '"nick"'))).not.toBe(migrationHash(source))
  })
})
