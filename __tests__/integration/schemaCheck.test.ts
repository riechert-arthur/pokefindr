import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { sql as q, type Migration, type RawBuilder, type Transaction } from "kysely"
import postgres from "postgres"
import { createMigrator, loadMigrations } from "../../scripts/db/migrator"
import { diffAgainstMigrations } from "../../scripts/db/schemaCheck"
import { testDatabaseUrl } from "./testDatabase"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
const { db } = createMigrator(sql)
let migrations: Migration[]

beforeAll(async () => {
  migrations = Object.values(await loadMigrations())
})
afterAll(() => sql.end({ timeout: 5 }))

/** Runs schema changes, diffs, then rolls everything back. */
async function diffAfter(...changes: RawBuilder<unknown>[]) {
  let differences: string[] = []
  await db
    .transaction()
    .execute(async (trx: Transaction<unknown>) => {
      for (const change of changes) await change.execute(trx)
      differences = await diffAgainstMigrations(trx, migrations)
      throw new Error("rollback")
    })
    .catch((err: Error) => {
      if (err.message !== "rollback") throw err
    })
  return differences
}

describe("diffAgainstMigrations", () => {
  it("finds no differences on a freshly migrated database, and leaves nothing behind", async () => {
    expect(await diffAfter()).toEqual([])
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      select exists(select 1 from pg_namespace where nspname = '_schema_check') as exists`
    expect(exists).toBe(false)
  })

  it("reports a missing column", async () => {
    const diff = await diffAfter(q`alter table locations drop column "machineID"`)
    expect(diff).toContain("missing column locations.machineID text")
    expect(diff).toContain('missing index locations: unique USING btree ("machineID")')
  })

  it("reports a missing table once", async () => {
    expect(await diffAfter(q`drop table locations_staging`)).toEqual(["missing table locations_staging"])
  })

  it("reports a missing default and a nullability change", async () => {
    const diff = await diffAfter(
      q`alter table subscriptions alter column start_date drop default`,
      q`alter table subscriptions alter column end_date drop not null`,
    )
    expect(diff).toEqual([
      "missing column subscriptions.start_date timestamp with time zone not null with a default",
      "missing column subscriptions.end_date timestamp with time zone not null",
      "unexpected column subscriptions.start_date timestamp with time zone not null",
      "unexpected column subscriptions.end_date timestamp with time zone",
    ])
  })

  it("reports missing and unexpected indexes, ignoring names", async () => {
    expect(await diffAfter(q`alter index locations_geog_gist rename to something_else`)).toEqual([])
    expect(await diffAfter(q`drop index locations_staging_geog_idx`)).toEqual([
      "missing index locations_staging: USING gist (geog)",
    ])
    expect(await diffAfter(q`create index extra_idx on profiles (username)`)).toEqual([
      "unexpected index profiles: USING btree (username)",
    ])
  })

  it("reports an index that became partial", async () => {
    const diff = await diffAfter(
      q`drop index locations_machine_id_key`,
      q`create unique index on locations ("machineID") where "machineID" is not null`,
    )
    expect(diff).toEqual([
      'missing index locations: unique USING btree ("machineID")',
      'unexpected index locations: unique USING btree ("machineID") WHERE ("machineID" IS NOT NULL)',
    ])
  })

  it("compares check constraint bodies, not just how many there are", async () => {
    const diff = await diffAfter(
      q`alter table location_ratings drop constraint location_ratings_rating_range`,
      q`alter table location_ratings add check (rating between 0 and 10)`,
    )
    expect(diff).toEqual([
      "missing check location_ratings: CHECK (((rating >= 1) AND (rating <= 5)))",
      "unexpected check location_ratings: CHECK (((rating >= 0) AND (rating <= 10)))",
    ])
  })

  it("reports an unexpected foreign key and an extra column", async () => {
    const diff = await diffAfter(
      q`alter table locations_staging add foreign key (created_by) references profiles (id)`,
      q`alter table profiles add column nickname text`,
    )
    expect(diff).toContain("unexpected foreign key locations_staging (created_by) → profiles(id) on delete no action")
    expect(diff).toContain("unexpected column profiles.nickname text")
  })

  it("reports a changed enum", async () => {
    expect(await diffAfter(q`alter type location_status add value 'unknown'`)).toEqual([
      "missing enum location_status (stocked, out-of-stock, out-of-order)",
      "unexpected enum location_status (stocked, out-of-stock, out-of-order, unknown)",
    ])
  })
})
