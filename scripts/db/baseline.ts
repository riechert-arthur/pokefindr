/**
 * Records database/migrations/0000_baseline.ts as already applied, without running it.
 *
 * Use this ONCE on a database that already has the schema (the existing
 * Supabase project). After that, `npm run db:migrate` applies only newer
 * migrations. On a fresh database, skip this and run `npm run db:migrate`.
 *
 *   npm run db:baseline -- --dry-run   # check, and show what would be recorded
 *   npm run db:baseline                # record it
 *
 * Before recording anything, the database is compared with what the baseline
 * migration builds (scripts/db/schemaCheck.ts): every table, column, primary
 * key, index, foreign key, check constraint and enum it creates. Any
 * difference stops the script, because a recorded baseline is never run
 * again, so anything it creates but the database lacks would never exist.
 *
 * Recording runs through Kysely's own Migrator, with the check in place of the
 * baseline's up(). So the check and the record happen in one transaction under
 * the migrator's lock (nothing can change the schema or migrate in between),
 * and the row written is exactly the one `db:migrate` would write. If the
 * database already has other migrations recorded, Kysely refuses.
 */
import { sql, type Transaction } from "kysely"
import { diffAgainstMigrations } from "./schemaCheck"
import { loadDevEnv, migrationClient } from "./env"
import {
  createMigrator,
  inRolledBackTransaction,
  loadMigrations,
  MIGRATION_SCHEMA,
  MIGRATION_TABLE,
  throwIfFailed,
} from "./migrator"

loadDevEnv()

const BASELINE = "0000_baseline"

async function main() {
  const dryRun = process.argv.includes("--dry-run")

  const baseline = (await loadMigrations())[BASELINE]
  if (!baseline) throw new Error(`database/migrations/${BASELINE}.ts not found`)

  const client = migrationClient()
  try {
    const { db, migrator } = createMigrator(client)
    const applied = (await migrator.getMigrations()).filter((m) => m.executedAt)
    if (applied.some((m) => m.name === BASELINE)) {
      console.log("The baseline is already recorded. Nothing to do.")
      return
    }
    if (applied.length > 0) {
      throw new Error(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE} already lists ${applied.map((m) => m.name).join(", ")} but not ${BASELINE}. Look before recording anything.`)
    }

    /** Throws unless `public` matches what the baseline builds. */
    async function check(trx: Transaction<unknown>) {
      // A database without our tables is fresh: it should be migrated, not baselined.
      const { rows } = await sql<{ count: number }>`
        select count(*)::int as count from information_schema.tables
        where table_schema = 'public' and table_name = 'locations'`.execute(trx)
      if (rows[0].count === 0) {
        throw new Error("This database doesn't have the baseline's tables. It looks fresh: run `npm run db:migrate` instead.")
      }

      const differences = await diffAgainstMigrations(trx, [baseline])
      if (differences.length > 0) {
        throw new Error(
          `The database doesn't match ${BASELINE} (${differences.length} difference(s)):\n` +
            differences.map((d) => `  - ${d}`).join("\n") +
            "\n\nFix the baseline migration and src/server/db/schema (or fix the database) before recording it. " +
            'See docs/database.md, "Adopting the existing Supabase database".',
        )
      }
      console.log(`Schema matches ${BASELINE}.`)
    }

    if (dryRun) {
      await inRolledBackTransaction(db, check)
      console.log(`[dry run] would record ${BASELINE} in ${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)
      return
    }

    const recorder = createMigrator(client, { [BASELINE]: { up: (trx) => check(trx as Transaction<unknown>) } })
    const result = await recorder.migrator.migrateTo(BASELINE)
    throwIfFailed(result)
    if (!result.results?.length) {
      // Another run recorded it while this one waited for the migrator's lock.
      console.log("The baseline is already recorded. Nothing to do.")
      return
    }
    console.log(`Recorded ${BASELINE} in ${MIGRATION_SCHEMA}.${MIGRATION_TABLE}. Run \`npm run db:migrate\` to apply newer migrations.`)
  } finally {
    await client.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
