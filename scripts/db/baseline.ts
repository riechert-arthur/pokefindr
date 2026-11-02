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
 * Writes the same bookkeeping row drizzle's migrator writes
 * (drizzle.__drizzle_migrations: sha256 of the SQL file + journal timestamp).
 */
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { loadEnvConfig } from "@next/env"

loadEnvConfig(path.resolve(__dirname, "../.."))

const MIGRATIONS_DIR = path.resolve(__dirname, "../../drizzle")
const BASELINE_TAG = "0000_baseline"

interface JournalEntry {
  idx: number
  when: number
  tag: string
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const url = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL
  if (!url) throw new Error("Set DATABASE_URL (or DATABASE_URL_UNPOOLED)")

  const journal = JSON.parse(
    readFileSync(path.join(MIGRATIONS_DIR, "meta/_journal.json"), "utf8"),
  ) as { entries: JournalEntry[] }
  const entry = journal.entries.find((e) => e.tag === BASELINE_TAG)
  if (!entry) throw new Error(`${BASELINE_TAG} not found in the migration journal`)

  const sqlText = readFileSync(path.join(MIGRATIONS_DIR, `${entry.tag}.sql`)).toString()
  const hash = createHash("sha256").update(sqlText).digest("hex")

  const sql = postgres(url, { max: 1, prepare: false })
  try {
    // Refuse to baseline a database that doesn't look like ours.
    const [{ count }] = await sql<{ count: number }[]>`
      select count(*)::int as count from information_schema.tables
      where table_schema = 'public' and table_name in ('locations', 'location_ratings', 'profiles')`
    if (count < 3) {
      throw new Error(
        "This database is missing locations/location_ratings/profiles. " +
          "It looks fresh: run `npm run db:migrate` instead.",
      )
    }

    const [{ exists }] = await sql<{ exists: boolean }[]>`
      select to_regclass('drizzle.__drizzle_migrations') is not null as exists`
    if (exists) {
      const rows = await sql`select 1 from drizzle.__drizzle_migrations where created_at >= ${entry.when}`
      if (rows.length > 0) {
        console.log("Baseline (or a later migration) is already recorded. Nothing to do.")
        return
      }
    }

    console.log(`${dryRun ? "[dry run] would record" : "Recording"} ${entry.tag} (${hash.slice(0, 12)}…, ${entry.when})`)
    if (dryRun) return

    await sql.begin(async (tx) => {
      await tx`create schema if not exists drizzle`
      await tx`create table if not exists drizzle.__drizzle_migrations (
        id serial primary key, hash text not null, created_at bigint)`
      await tx`insert into drizzle.__drizzle_migrations (hash, created_at) values (${hash}, ${entry.when})`
    })
    console.log("Done. Run `npm run db:migrate` to apply newer migrations.")
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
