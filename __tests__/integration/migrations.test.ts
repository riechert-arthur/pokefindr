import { execFile } from "node:child_process"
import path from "node:path"
import { promisify } from "node:util"
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest"
import { sql as q, type Kysely, type Migration, type RawBuilder } from "kysely"
import postgres from "postgres"
import { schemaDrift } from "../../scripts/db/drift"
import {
  createMigrator,
  inRolledBackTransaction,
  loadMigrations,
  MIGRATION_HASH_TABLE,
  MIGRATION_SCHEMA,
  migrationFileHashes,
  MIGRATION_TABLE,
  throwIfFailed,
  type Migrations,
} from "../../scripts/db/migrator"
import { diffAgainstMigrations } from "../../scripts/db/schemaCheck"
import { testDatabaseUrl } from "./testDatabase"

const ROOT = path.resolve(__dirname, "../..")
const BASELINE = "0000_baseline"
const FIXTURE = "9999_round_trip_fixture"
const MERGED_LATE = "0000_a_merged_late"

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

const hashes = async () =>
  new Map(
    (await sql<{ name: string; hash: string }[]>`select name, hash from ${sql(`${MIGRATION_SCHEMA}.${MIGRATION_HASH_TABLE}`)}`).map(
      (r) => [r.name, r.hash],
    ),
  )

/** Diffs public against the given migrations in a transaction that is rolled back. */
const diffAgainst = (names: string[]) =>
  inRolledBackTransaction(db, (trx) =>
    diffAgainstMigrations(
      trx,
      names.map((n) => real[n]),
    ),
  )

afterEach(async () => {
  // Leave the shared test database fully migrated with only the real migrations.
  await sql`alter table if exists locations drop column if exists fixture_note`
  await sql`drop table if exists round_trip_fixture`
  await sql`delete from ${sql(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)} where name in (${FIXTURE}, ${MERGED_LATE})`
  // db:baseline tests drop the whole kysely schema, hash table included.
  const [{ table }] = await sql<{ table: string | null }[]>`select to_regclass(${`${MIGRATION_SCHEMA}.${MIGRATION_HASH_TABLE}`})::text as table`
  if (table) await sql`delete from ${sql(`${MIGRATION_SCHEMA}.${MIGRATION_HASH_TABLE}`)} where name in (${FIXTURE}, ${MERGED_LATE})`
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

  it("records the hash of each migration file it applies", async () => {
    const files = migrationFileHashes()
    const recordedHashes = await hashes()
    // The baseline may be recorded by db:baseline, which has no file hash to give.
    for (const name of Object.keys(real).filter((n) => n !== BASELINE)) expect(recordedHashes.get(name)).toBe(files.get(name))
  })

  it("records a hash as a migration runs, and forgets it when it's rolled back", async () => {
    const { migrator } = createMigrator(sql, migrationsWith({ [FIXTURE]: { ...fixture, hash: "fixture-hash" } }))
    throwIfFailed(await migrator.migrateToLatest())
    expect((await hashes()).get(FIXTURE)).toBe("fixture-hash")

    throwIfFailed(await migrator.migrateDown())
    expect((await hashes()).has(FIXTURE)).toBe(false)
  })

  it("builds exactly the Drizzle schema", async () => {
    expect(await schemaDrift(db)).toEqual([])
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
    expect(await schemaDrift(db)).toEqual([])
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
    const result = await createMigrator(sql, migrationsWith({ [MERGED_LATE]: createFixtureTable })).migrator.migrateToLatest()
    expect(() => throwIfFailed(result)).toThrow(/corrupted migrations/)
    expect(await recorded()).not.toContain(MERGED_LATE)
  })
})

describe("schemaDrift", () => {
  /** Runs schema changes, checks drift, then rolls the changes back. */
  const driftAfter = (...changes: RawBuilder<unknown>[]) =>
    inRolledBackTransaction(db, async (trx) => {
      for (const change of changes) await change.execute(trx)
      return schemaDrift(trx)
    })

  it("reports what drizzle-kit would change when the database drifts from the schema", async () => {
    const drift = await driftAfter(q`drop index locations_geog_gist`, q`alter table profiles add column nickname text`)
    expect(drift).toEqual(
      expect.arrayContaining([
        'CREATE INDEX "locations_geog_gist" ON "locations" USING gist ("geog");',
        'ALTER TABLE "profiles" DROP COLUMN "nickname";',
      ]),
    )
  })

  it("still reports a geography column that has the wrong type", async () => {
    const drift = await driftAfter(
      q`alter table locations_staging alter column geog type geometry(point, 4326) using geog::geometry`,
    )
    expect(drift).toEqual([
      'ALTER TABLE "locations_staging" ALTER COLUMN "geog" SET DATA TYPE "undefined"."geography(point, 4326)";',
    ])
  })

  it("ignores what the schema doesn't model, as on Supabase", async () => {
    const drift = await driftAfter(
      q`truncate profiles cascade`,
      q`create table "Vending Machine Locations" (id int primary key, "machineID" text)`,
      q`create view latest_status_reports as select * from status_reports`,
      q`create schema auth`,
      q`create table auth.users (id uuid primary key)`,
      q`alter table profiles add foreign key (id) references auth.users (id)`,
      q`alter table locations enable row level security`,
      q`create policy anyone_reads on locations for select using (true)`,
    )
    expect(drift).toEqual([])
  })

  it("still reports a dropped foreign key within public", async () => {
    const drift = await driftAfter(
      q`alter table subscriptions drop constraint subscriptions_user_id_profiles_id_fk`,
      q`alter table subscriptions add constraint subscriptions_user_fk foreign key (user_id) references profiles (id)`,
    )
    expect(drift).toEqual(
      expect.arrayContaining(['ALTER TABLE "subscriptions" DROP CONSTRAINT "subscriptions_user_fk";']),
    )
  })

  it("fails fast with a clear error on an ambiguous rename, instead of waiting on a hidden prompt", async () => {
    await expect(driftAfter(q`alter table profiles rename column full_name to display_name`)).rejects.toThrow(
      /renamed or replaced/,
    )
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

  it("records the baseline once when two runs race", async () => {
    await forgetHistory()
    const outputs = await Promise.all([run(), run()])
    expect(await recorded()).toEqual([BASELINE])
    expect(outputs.filter((o) => o.stdout.includes(`Recorded ${BASELINE}`)).length).toBeGreaterThanOrEqual(1)
  }, 60_000)

  it("refuses a database that doesn't match the baseline, and records nothing", async () => {
    await forgetHistory()
    await sql`drop index locations_geog_gist`
    try {
      await expect(run()).rejects.toMatchObject({
        stderr: expect.stringContaining("missing index locations: USING gist (geog)"),
      })
      // Kysely creates its (empty) bookkeeping table before running the check; no row is written.
      expect(await recorded()).toEqual([])
    } finally {
      await sql`create index locations_geog_gist on locations using gist (geog)`
      await run()
    }
  }, 60_000)
})

describe("0011_submissions", () => {
  it("moves event times from published highlights, taking the one that ends last", async () => {
    const { migrator } = createMigrator(sql)
    throwIfFailed(await migrator.migrateTo("0010_unique_usernames"))
    const point = sql`ST_SetSRID(ST_MakePoint(-105, 39.7), 4326)::geography`
    const [show] = await sql<{ id: string }[]>`insert into locations (name, kind, geog) values ('Card show', 'event', ${point}) returning id`
    const [draft] = await sql<{ id: string }[]>`insert into locations (name, kind, geog) values ('Draft show', 'event', ${point}) returning id`
    await sql`insert into highlights (kind, title, starts_at, ends_at, location_id) values
      ('event', 'Last year', '2025-11-01T17:00Z', '2025-11-01T22:00Z', ${show.id}),
      ('event', 'This year', '2026-12-05T17:00Z', null, ${show.id})`
    await sql`insert into highlights (kind, title, starts_at, location_id, is_published) values ('event', 'Not out yet', '2026-12-05T17:00Z', ${draft.id}, false)`
    throwIfFailed(await migrator.migrateToLatest())
    const rows = await sql<{ location_id: string; starts_at: Date }[]>`select location_id, starts_at from event_details`
    expect(rows).toEqual([{ location_id: show.id, starts_at: new Date("2026-12-05T17:00Z") }])
    await sql`truncate locations cascade`
  })
})

describe("0022_super_admin", () => {
  it("turns super admins back into admins when rolled back, since the old check doesn't allow them", async () => {
    const { migrator } = createMigrator(sql)
    throwIfFailed(await migrator.migrateToLatest())
    const [u] = await sql<{ id: string }[]>`insert into users (name, email) values ('Oak', 'oak@example.test') returning id`
    await sql`insert into profiles (id, username, role) values (${u.id}, 'oak', 'super_admin')`
    throwIfFailed(await migrator.migrateTo("0021_location_canaries"))
    const [row] = await sql<{ role: string }[]>`select role from profiles where id = ${u.id}`
    expect(row.role).toBe("admin")
    throwIfFailed(await migrator.migrateToLatest())
    await sql`truncate users cascade`
  })
})
