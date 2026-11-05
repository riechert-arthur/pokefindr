import path from "node:path"
import { readFileSync } from "node:fs"
import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { diffAgainstSnapshot, type Snapshot } from "../../scripts/db/schemaCheck"
import { testDatabaseUrl } from "./testDatabase"

const metaDir = path.resolve(__dirname, "../../drizzle/meta")
const journal = JSON.parse(readFileSync(path.join(metaDir, "_journal.json"), "utf8")) as {
  entries: { tag: string }[]
}
const latestTag = journal.entries.at(-1)!.tag
const snapshot = JSON.parse(
  readFileSync(path.join(metaDir, `${latestTag.split("_")[0]}_snapshot.json`), "utf8"),
) as Snapshot

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
afterAll(() => sql.end({ timeout: 5 }))

/** Runs a schema change, diffs, then rolls the change back. */
async function diffAfter(change: (tx: postgres.TransactionSql) => Promise<unknown>) {
  let differences: string[] = []
  await sql
    .begin(async (tx) => {
      await change(tx)
      differences = await diffAgainstSnapshot(tx as unknown as postgres.Sql, snapshot)
      throw new Error("rollback")
    })
    .catch((err: Error) => {
      if (err.message !== "rollback") throw err
    })
  return differences
}

describe("diffAgainstSnapshot", () => {
  it("finds no differences on a freshly migrated database", async () => {
    expect(await diffAgainstSnapshot(sql, snapshot)).toEqual([])
  })

  it("reports a missing column", async () => {
    const diff = await diffAfter((tx) => tx`alter table locations drop column "machineID"`)
    expect(diff).toContain("missing column locations.machineID (text)")
  })

  it("reports a missing table", async () => {
    const diff = await diffAfter((tx) => tx`drop table locations_staging`)
    expect(diff).toContain("missing table locations_staging")
  })

  it("reports a missing default and a nullability change", async () => {
    const diff = await diffAfter(async (tx) => {
      await tx`alter table subscriptions alter column start_date drop default`
      await tx`alter table subscriptions alter column end_date drop not null`
    })
    expect(diff).toContain("column subscriptions.start_date has no default, expected one")
    expect(diff).toContain("column subscriptions.end_date is nullable, expected NOT NULL")
  })

  it("reports missing and unexpected indexes, ignoring names", async () => {
    const renamed = await diffAfter((tx) => tx`alter index locations_geog_gist rename to something_else`)
    expect(renamed).toEqual([])

    const dropped = await diffAfter((tx) => tx`drop index locations_staging_geog_idx`)
    expect(dropped).toContain("missing index locations_staging: gist index on (geog)")

    const extra = await diffAfter((tx) => tx`create index extra_idx on profiles (username)`)
    expect(extra).toContain("unexpected index profiles: btree index on (username)")
  })

  it("reports an unexpected foreign key and an extra column", async () => {
    const diff = await diffAfter(async (tx) => {
      await tx`alter table locations_staging add foreign key (created_by) references profiles (id)`
      await tx`alter table profiles add column nickname text`
    })
    expect(diff).toContain(
      "unexpected foreign key locations_staging: foreign key (created_by) → profiles(id) on delete no action",
    )
    expect(diff).toContain("unexpected column profiles.nickname")
  })

  it("reports a changed enum", async () => {
    const diff = await diffAfter((tx) => tx`alter type location_status add value 'unknown'`)
    expect(diff).toContain(
      "enum location_status is (stocked, out-of-stock, out-of-order, unknown), expected (stocked, out-of-stock, out-of-order)",
    )
  })
})
