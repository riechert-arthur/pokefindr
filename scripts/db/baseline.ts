/**
 * Records drizzle/0000_baseline.sql as already applied, without running it.
 *
 * Use this ONCE on a database that already has the schema (the existing
 * Supabase project). After that, `npm run db:migrate` applies only newer
 * migrations. On a fresh database, skip this and run `npm run db:migrate`.
 *
 *   npm run db:baseline -- --dry-run   # show what would be recorded
 *   npm run db:baseline                # record it
 *
 * Before recording anything, the database is compared with the baseline's
 * snapshot (drizzle/meta/0000_snapshot.json): every modelled table, column,
 * primary key, index, foreign key, check constraint and enum. Any difference
 * stops the script, because a recorded baseline is never run again, so
 * anything it describes but the database lacks would never be created.
 *
 * Writes the same bookkeeping row Kysely's migrator writes when it applies a
 * migration (kysely.kysely_migration: name + ISO timestamp; see
 * scripts/db/migrator.ts). Everything runs in one transaction under an
 * advisory lock, so concurrent runs can't both record it.
 */
import postgres from "postgres"
import { diffAgainstSnapshot } from "./schemaCheck"
import { loadDevEnv, loadSnapshot, migrationDatabaseUrl, readJournal } from "./migrations"
import { MIGRATION_SCHEMA, MIGRATION_TABLE } from "./migrator"

loadDevEnv()

const BASELINE_TAG = "0000_baseline"
/** Arbitrary key for pg_advisory_xact_lock; only this script uses it. */
const LOCK_KEY = 640_000_001

const migrationTable = (tx: postgres.TransactionSql) => tx(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)

/** Names of migrations already recorded, or [] if Kysely has never run here. */
async function recordedMigrations(tx: postgres.TransactionSql): Promise<string[]> {
  const [{ exists }] = await tx<{ exists: boolean }[]>`
    select to_regclass(${`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`}) is not null as exists`
  if (!exists) return []
  const rows = await tx<{ name: string }[]>`select name from ${migrationTable(tx)} order by name`
  return rows.map((r) => r.name)
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const url = migrationDatabaseUrl()
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED)")

  const entry = readJournal().find((e) => e.tag === BASELINE_TAG)
  if (!entry) throw new Error(`${BASELINE_TAG} not found in the migration journal`)
  const snapshot = loadSnapshot(entry.tag)

  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
  try {
    await sql.begin(async (tx) => {
      // Serialise concurrent runs; the lock is released when the transaction ends.
      await tx`select pg_advisory_xact_lock(${LOCK_KEY})`

      const recorded = await recordedMigrations(tx)
      if (recorded.includes(BASELINE_TAG)) {
        console.log("The baseline is already recorded. Nothing to do.")
        return
      }
      if (recorded.length > 0) {
        throw new Error(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE} already lists ${recorded.join(", ")} but not ${BASELINE_TAG}. Look before recording anything.`)
      }

      // A database with none of our tables is fresh: it should be migrated, not baselined.
      const tableNames = Object.values(snapshot.tables).map((t) => t.name)
      const [{ count }] = await tx<{ count: number }[]>`
        select count(*)::int as count from information_schema.tables
        where table_schema = 'public' and table_name = any(${tableNames})`
      if (count === 0) {
        throw new Error("This database has none of the baseline's tables. It looks fresh: run `npm run db:migrate` instead.")
      }

      // Refuse to baseline a database that doesn't match the baseline exactly.
      const differences = await diffAgainstSnapshot(tx, snapshot)
      if (differences.length > 0) {
        throw new Error(
          `The database doesn't match ${entry.tag} (${differences.length} difference(s)):\n` +
            differences.map((d) => `  - ${d}`).join("\n") +
            "\n\nFix the schema and regenerate the baseline (or fix the database) before recording it. " +
            "See docs/database.md, \"Adopting the existing Supabase database\".",
        )
      }
      console.log(`Schema matches ${entry.tag}.`)

      console.log(`${dryRun ? "[dry run] would record" : "Recording"} ${entry.tag} in ${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)
      if (dryRun) return

      // Same columns Kysely's Migrator creates; it reuses the table if it exists.
      await tx`create schema if not exists ${tx(MIGRATION_SCHEMA)}`
      await tx`create table if not exists ${migrationTable(tx)} (
        name varchar(255) not null primary key, timestamp varchar(255) not null)`
      await tx`insert into ${migrationTable(tx)} (name, timestamp) values (${BASELINE_TAG}, ${new Date().toISOString()})`
      console.log("Done. Run `npm run db:migrate` to apply newer migrations.")
    })
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
