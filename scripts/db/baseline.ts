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
 * Recording goes through Kysely's own Migrator, with a no-op in place of the
 * baseline's up(), so it writes exactly the row `db:migrate` would, under
 * Kysely's lock. If the database already has other migrations recorded,
 * Kysely refuses.
 */
import { Kysely, sql } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"
import postgres from "postgres"
import { diffAgainstMigrations } from "./schemaCheck"
import { loadDevEnv, migrationDatabaseUrl } from "./env"
import { createMigrator, loadMigrations, MIGRATION_SCHEMA, MIGRATION_TABLE, throwIfFailed } from "./migrator"

loadDevEnv()

const BASELINE = "0000_baseline"

class Rollback extends Error {}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const url = migrationDatabaseUrl()
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED)")

  const baseline = (await loadMigrations())[BASELINE]
  if (!baseline) throw new Error(`database/migrations/${BASELINE}.ts not found`)

  const client = postgres(url, { max: 1, prepare: false, onnotice: () => {} })
  const db = new Kysely<unknown>({ dialect: new PostgresJSDialect({ postgres: client }) })
  try {
    const { migrator } = createMigrator(client, { [BASELINE]: { up: async () => {} } })
    const applied = (await createMigrator(client).migrator.getMigrations()).filter((m) => m.executedAt)
    if (applied.some((m) => m.name === BASELINE)) {
      console.log("The baseline is already recorded. Nothing to do.")
      return
    }
    if (applied.length > 0) {
      throw new Error(`${MIGRATION_SCHEMA}.${MIGRATION_TABLE} already lists ${applied.map((m) => m.name).join(", ")} but not ${BASELINE}. Look before recording anything.`)
    }

    // Read-only check, rolled back whatever happens.
    let differences: string[] = []
    let hasTables = false
    await db
      .transaction()
      .execute(async (trx) => {
        const { rows } = await sql<{ count: number }>`
          select count(*)::int as count from information_schema.tables
          where table_schema = 'public' and table_name = 'locations'`.execute(trx)
        hasTables = rows[0].count > 0
        if (hasTables) differences = await diffAgainstMigrations(trx, [baseline])
        throw new Rollback()
      })
      .catch((err) => {
        if (!(err instanceof Rollback)) throw err
      })

    // A database without our tables is fresh: it should be migrated, not baselined.
    if (!hasTables) {
      throw new Error("This database doesn't have the baseline's tables. It looks fresh: run `npm run db:migrate` instead.")
    }
    if (differences.length > 0) {
      throw new Error(
        `The database doesn't match ${BASELINE} (${differences.length} difference(s)):\n` +
          differences.map((d) => `  - ${d}`).join("\n") +
          "\n\nFix the baseline migration and src/server/db/schema (or fix the database) before recording it. " +
          'See docs/database.md, "Adopting the existing Supabase database".',
      )
    }
    console.log(`Schema matches ${BASELINE}.`)

    console.log(`${dryRun ? "[dry run] would record" : "Recording"} ${BASELINE} in ${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`)
    if (dryRun) return

    throwIfFailed(await migrator.migrateTo(BASELINE))
    console.log("Done. Run `npm run db:migrate` to apply newer migrations.")
  } finally {
    await client.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
