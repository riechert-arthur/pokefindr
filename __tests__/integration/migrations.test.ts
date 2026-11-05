import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import type { Kysely, Migration, Transaction } from "kysely"
import postgres from "postgres"
import { schemaDrift } from "../../scripts/db/drift"
import {
  createMigrator,
  loadMigrations,
  MIGRATION_SCHEMA,
  MIGRATION_TABLE,
  throwIfFailed,
  type Migrations,
} from "../../scripts/db/migrator"
import { diffAgainstMigrations } from "../../scripts/db/schemaCheck"
import { testDatabaseUrl } from "./testDatabase"

const ROOT = path.resolve(__dirname, "../..")
const BASELINE = "0000_baseline"
const FIXTURE = "9999_round_trip_fixture"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
const { db } = createMigrator(sql)
let real: Migrations

beforeAll(async () => {
  real = await loadMigrations()
})

/** The real migrations plus extra ones, as the migrator would load them. */
const migrationsWith = (extra: Migrations) => ({ ...real, ...extra })

const fixture: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema.createTable("round_trip_fixture").addColumn("id", "integer", (c) => c.primaryKey()).execute()
    await db.schema.alterTable("locations").addColumn("fixture_note", "text").execute()
  },
  down: async (db: Kysely<unknown>) => {
    await db.schema.alterTable("locations").dropColumn("fixture_note").execute()
    await db.schema.dropTable("round_trip_fixture").execute()
  },
}
const createFixtureTable: Migration = {
  up: async (db: Kysely<unknown>) => {
    await db.schema.createTable("round_trip_fixture").addColumn("id", "integer", (c) => c.primaryKey()).execute()
  },
}

const recorded = async () =>
  (await sql<{ name: string }[]>`select name from ${sql(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)} order by name`).map(
    (r) => r.name,
  )

/** Diffs public against the given migrations in a transaction that is rolled back. */
async function diffAgainst(names: string[]) {
  let differences: string[] = []
  await db
    .transaction()
    .execute(async (trx: Transaction<unknown>) => {
      differences = await diffAgainstMigrations(
        trx,
        names.map((n) => real[n]),
      )
      throw new Error("rollback")
    })
    .catch((err: Error) => {
      if (err.message !== "rollback") throw err
    })
  return differences
}

afterEach(async () => {
  // Leave the shared test database fully migrated with only the real migrations.
  await sql`alter table if exists locations drop column if exists fixture_note`
  await sql`drop table if exists round_trip_fixture`
  await sql`delete from ${sql(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)} where name like '9999_%' or name like '0000_a%'`
  throwIfFailed(await createMigrator(sql).migrator.migrateToLatest())
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
})

describe("migrator", () => {
  it("records every migration in the kysely schema, not public", async () => {
    expect(await recorded()).toEqual(Object.keys(real))
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from information_schema.tables
      where table_schema = 'public' and table_name like 'kysely%'`
    expect(count).toBe(0)
  })

  it("builds exactly the Drizzle schema", async () => {
    expect(await schemaDrift(sql)).toEqual([])
  })

  it("runs up, down and up again, and the schema matches each time", async () => {
    const { migrator } = createMigrator(sql, migrationsWith({ [FIXTURE]: fixture }))

    throwIfFailed(await migrator.migrateToLatest())
    expect(await recorded()).toContain(FIXTURE)
    const [{ exists }] = await sql<{ exists: boolean }[]>`select to_regclass('public.round_trip_fixture') is not null as exists`
    expect(exists).toBe(true)

    // Roll back everything after the baseline: the fixture plus every real down().
    throwIfFailed(await migrator.migrateTo(BASELINE))
    expect(await recorded()).toEqual([BASELINE])
    expect(await diffAgainst([BASELINE])).toEqual([])

    throwIfFailed(await createMigrator(sql).migrator.migrateToLatest())
    expect(await recorded()).toEqual(Object.keys(real))
    expect(await diffAgainst(Object.keys(real))).toEqual([])
    expect(await schemaDrift(sql)).toEqual([])
  })

  it("refuses to roll back a migration without down(), and changes nothing", async () => {
    const { migrator } = createMigrator(sql, migrationsWith({ [FIXTURE]: createFixtureTable }))
    throwIfFailed(await migrator.migrateToLatest())

    const result = await migrator.migrateDown()
    expect(() => throwIfFailed(result)).toThrow(`${FIXTURE} (down) failed: ${FIXTURE} can't be rolled back`)
    expect(await recorded()).toContain(FIXTURE)
  })

  it("refuses to roll back the baseline", async () => {
    throwIfFailed(await createMigrator(sql).migrator.migrateTo(BASELINE))
    const result = await createMigrator(sql).migrator.migrateDown()
    expect(() => throwIfFailed(result)).toThrow(`${BASELINE} can't be rolled back`)
    expect(await recorded()).toEqual([BASELINE])
    expect(await diffAgainst([BASELINE])).toEqual([])
  })

  it("refuses a new migration that sorts before one already applied, instead of skipping it", async () => {
    const result = await createMigrator(sql, migrationsWith({ "0000_a_merged_late": createFixtureTable })).migrator.migrateToLatest()
    expect(() => throwIfFailed(result)).toThrow(/corrupted migrations/)
    expect(await recorded()).not.toContain("0000_a_merged_late")
  })
})

describe("schemaDrift", () => {
  /** Runs schema changes, checks drift, then rolls the changes back. */
  async function driftAfter(change: (tx: postgres.TransactionSql) => Promise<unknown>) {
    let drift: string[] = []
    await sql
      .begin(async (tx) => {
        await change(tx)
        drift = await schemaDrift(tx)
        throw new Error("rollback")
      })
      .catch((err: Error) => {
        if (err.message !== "rollback") throw err
      })
    return drift
  }

  it("reports what drizzle-kit would change when the database drifts from the schema", async () => {
    const drift = await driftAfter(async (tx) => {
      await tx`drop index locations_geog_gist`
      await tx`alter table profiles add column nickname text`
    })
    expect(drift).toEqual(
      expect.arrayContaining([
        'CREATE INDEX "locations_geog_gist" ON "locations" USING gist ("geog");',
        'ALTER TABLE "profiles" DROP COLUMN "nickname";',
      ]),
    )
  })

  it("still reports a geography column that has the wrong type", async () => {
    const drift = await driftAfter((tx) => tx`alter table locations_staging alter column geog type geometry(point, 4326) using geog::geometry`)
    expect(drift).toEqual([
      'ALTER TABLE "locations_staging" ALTER COLUMN "geog" SET DATA TYPE "undefined"."geography(point, 4326)";',
    ])
  })
})

describe("db:baseline", () => {
  const run = (...args: string[]) =>
    promisify(execFile)(path.join(ROOT, "node_modules/.bin/tsx"), ["scripts/db/baseline.ts", ...args], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL_UNPOOLED: testDatabaseUrl() },
    })

  /** Makes the test database look like production before adoption: schema, no history. */
  async function forgetHistory() {
    throwIfFailed(await createMigrator(sql).migrator.migrateTo(BASELINE))
    await sql`drop schema ${sql(MIGRATION_SCHEMA)} cascade`
  }

  it("records the baseline on a database that has the schema but no migration history", async () => {
    await forgetHistory()

    const dry = await run("--dry-run")
    expect(dry.stdout).toContain(`[dry run] would record ${BASELINE}`)
    const [{ exists }] = await sql<{ exists: boolean }[]>`
      select to_regclass(${`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`}) is not null as exists`
    expect(exists).toBe(false)

    await run()
    expect(await recorded()).toEqual([BASELINE])
    expect((await run()).stdout).toContain("already recorded")

    // Kysely accepts the recorded row and applies only what comes after.
    const result = await createMigrator(sql).migrator.migrateToLatest()
    throwIfFailed(result)
    expect(result.results?.map((r) => r.migrationName)).toEqual(Object.keys(real).filter((t) => t !== BASELINE))
  }, 60_000)

  it("refuses a database that doesn't match the baseline, and records nothing", async () => {
    await forgetHistory()
    await sql`drop index locations_geog_gist`
    try {
      await expect(run()).rejects.toMatchObject({
        stderr: expect.stringContaining("missing index locations: USING gist (geog)"),
      })
      const [{ exists }] = await sql<{ exists: boolean }[]>`
        select to_regclass(${`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`}) is not null as exists`
      expect(exists).toBe(false)
    } finally {
      await sql`create index locations_geog_gist on locations using gist (geog)`
      await run()
    }
  }, 60_000)
})
