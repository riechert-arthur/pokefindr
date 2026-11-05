import { execFile } from "node:child_process"
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { promisify } from "node:util"
import { afterAll, afterEach, describe, expect, it } from "vitest"
import postgres from "postgres"
import { loadSnapshot, MIGRATIONS_DIR, readJournal } from "../../scripts/db/migrations"
import { createMigrator, MIGRATION_SCHEMA, MIGRATION_TABLE, throwIfFailed } from "../../scripts/db/migrator"
import { diffAgainstSnapshot } from "../../scripts/db/schemaCheck"
import { testDatabaseUrl } from "./testDatabase"

const ROOT = path.resolve(__dirname, "../..")
const BASELINE = "0000_baseline"
const FIXTURE = "9999_round_trip_fixture"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
const tempDirs: string[] = []

/** Copies drizzle/ to a temp folder and appends extra migrations to its journal. */
function migrationsWith(extra: { tag: string; up: string; down?: string }[]) {
  const dir = mkdtempSync(path.join(tmpdir(), "pokefindr-migrations-"))
  tempDirs.push(dir)
  cpSync(MIGRATIONS_DIR, dir, { recursive: true })
  const journalFile = path.join(dir, "meta/_journal.json")
  const journal = JSON.parse(readFileSync(journalFile, "utf8"))
  for (const m of extra) {
    journal.entries.push({ idx: journal.entries.length, version: "7", when: Date.now(), tag: m.tag, breakpoints: true })
    writeFileSync(path.join(dir, `${m.tag}.sql`), m.up)
    mkdirSync(path.join(dir, "down"), { recursive: true })
    if (m.down) writeFileSync(path.join(dir, "down", `${m.tag}.sql`), m.down)
  }
  writeFileSync(journalFile, JSON.stringify(journal))
  return dir
}

const recorded = async () =>
  (await sql<{ name: string }[]>`select name from ${sql(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)} order by name`).map(
    (r) => r.name,
  )

const allTags = () => readJournal().map((e) => e.tag)

afterEach(async () => {
  // Leave the shared test database fully migrated with only the real migrations.
  await sql`drop table if exists round_trip_fixture`
  await sql`delete from ${sql(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)} where name like '9999_%' or name like '0000_a%'`
  throwIfFailed(await createMigrator(sql).migrator.migrateToLatest())
})

afterAll(async () => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
  await sql.end({ timeout: 5 })
})

describe("migrator", () => {
  it("records every migration in the kysely schema, not public", async () => {
    expect(await recorded()).toEqual(allTags())
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from information_schema.tables
      where table_schema = 'public' and table_name like 'kysely%'`
    expect(count).toBe(0)
  })

  it("runs up, down and up again, and the schema matches each time", async () => {
    const dir = migrationsWith([
      {
        tag: FIXTURE,
        up: 'create table round_trip_fixture (id int primary key);--> statement-breakpoint\nalter table locations add column "fixture_note" text;',
        down: 'alter table locations drop column "fixture_note";\n--> statement-breakpoint\ndrop table round_trip_fixture;',
      },
    ])
    const { migrator } = createMigrator(sql, dir)

    throwIfFailed(await migrator.migrateToLatest())
    expect(await recorded()).toContain(FIXTURE)
    const [{ exists }] = await sql<{ exists: boolean }[]>`select to_regclass('public.round_trip_fixture') is not null as exists`
    expect(exists).toBe(true)

    // Roll back everything after the baseline: the fixture plus every real down file.
    throwIfFailed(await migrator.migrateTo(BASELINE))
    expect(await recorded()).toEqual([BASELINE])
    expect(await diffAgainstSnapshot(sql, loadSnapshot(BASELINE))).toEqual([])

    throwIfFailed(await createMigrator(sql).migrator.migrateToLatest())
    expect(await recorded()).toEqual(allTags())
    expect(await diffAgainstSnapshot(sql, loadSnapshot())).toEqual([])
  })

  it("refuses to roll back a migration without a down file, and changes nothing", async () => {
    const dir = migrationsWith([{ tag: FIXTURE, up: "create table round_trip_fixture (id int primary key);" }])
    const { migrator } = createMigrator(sql, dir)
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
    expect(await diffAgainstSnapshot(sql, loadSnapshot(BASELINE))).toEqual([])
  })

  it("refuses a new migration that sorts before one already applied, instead of skipping it", async () => {
    const dir = migrationsWith([{ tag: "0000_a_merged_late", up: "create table round_trip_fixture (id int primary key);" }])
    const result = await createMigrator(sql, dir).migrator.migrateToLatest()
    expect(() => throwIfFailed(result)).toThrow(/corrupted migrations/)
    expect(await recorded()).not.toContain("0000_a_merged_late")
  })
})

describe("db:baseline", () => {
  const run = (...args: string[]) =>
    promisify(execFile)(path.join(ROOT, "node_modules/.bin/tsx"), ["scripts/db/baseline.ts", ...args], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL_UNPOOLED: testDatabaseUrl() },
    })

  it("records the baseline on a database that has the schema but no migration history", async () => {
    // Make the test database look like production before adoption: schema, no history.
    throwIfFailed(await createMigrator(sql).migrator.migrateTo(BASELINE))
    await sql`drop schema ${sql(MIGRATION_SCHEMA)} cascade`

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
    expect(result.results?.map((r) => r.migrationName)).toEqual(allTags().filter((t) => t !== BASELINE))
  }, 60_000)
})
