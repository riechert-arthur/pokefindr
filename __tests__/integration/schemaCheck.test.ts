import { afterAll, describe, expect, it } from "vitest"
import postgres from "postgres"
import { diffAgainstSnapshot } from "../../scripts/db/schemaCheck"
import { loadSnapshot } from "../../scripts/db/migrations"
import { testDatabaseUrl } from "./testDatabase"

const snapshot = loadSnapshot()

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
afterAll(() => sql.end({ timeout: 5 }))

/** Runs a schema change, diffs, then rolls the change back. */
async function diffAfter(change: (tx: postgres.TransactionSql) => Promise<unknown>) {
  let differences: string[] = []
  await sql
    .begin(async (tx) => {
      await change(tx)
      differences = await diffAgainstSnapshot(tx, snapshot)
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
    expect(diff).toContain('missing index locations: create unique index on locations using btree ("machineID")')
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
    expect(dropped).toContain("missing index locations_staging: USING gist (geog)")

    const extra = await diffAfter((tx) => tx`create index extra_idx on profiles (username)`)
    expect(extra).toContain("unexpected index profiles: USING btree (username)")
  })

  it("reports an index that became partial", async () => {
    const diff = await diffAfter(async (tx) => {
      await tx`drop index locations_machine_id_key`
      await tx`create unique index on locations ("machineID") where "machineID" is not null`
    })
    expect(diff).toEqual([
      'missing index locations: unique USING btree ("machineID")',
      'unexpected index locations: unique USING btree ("machineID") WHERE ("machineID" IS NOT NULL)',
    ])
  })

  it("compares check constraint bodies, not just how many there are", async () => {
    const diff = await diffAfter(async (tx) => {
      await tx`alter table location_ratings drop constraint location_ratings_rating_range`
      await tx`alter table location_ratings add check (rating between 0 and 10)`
    })
    expect(diff).toEqual([
      "missing check constraint location_ratings: CHECK (((rating >= 1) AND (rating <= 5)))",
      "unexpected check constraint location_ratings: CHECK (((rating >= 0) AND (rating <= 10)))",
    ])
  })

  it("ignores schema-qualified type names when public isn't on search_path", async () => {
    expect(await diffAfter((tx) => tx`set local search_path = pg_catalog`)).toEqual([])
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
