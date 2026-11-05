/**
 * Makes sure the database in DATABASE_URL exists. The init container runs this
 * before migrating (see "Branch databases" in docs/database.md).
 *
 * Each git branch has its own local database. The first time a branch runs, its
 * database is copied from main's (BASE_DATABASE), so it starts with main's
 * migrations and data. If main's database has a migration this branch doesn't
 * (main moved on after the branch was cut), a copy would fail Kysely's
 * missing-migration check, so the branch starts from an empty database instead.
 */
import { readdirSync } from "node:fs"
import postgres from "postgres"
import { loadDevEnv, migrationDatabaseUrl } from "./env"
import { MIGRATION_FILE, MIGRATION_SCHEMA, MIGRATION_TABLE, MIGRATIONS_DIR } from "./migrator"

/** A branch database can start as a copy only if every migration applied to the base exists on this branch. */
export function canCopyBase(appliedOnBase: string[], branchMigrations: string[]): boolean {
  const onBranch = new Set(branchMigrations)
  return appliedOnBase.every((name) => onBranch.has(name))
}

function withDatabase(url: URL, database: string): string {
  const copy = new URL(url)
  copy.pathname = `/${database}`
  return copy.toString()
}

async function appliedMigrations(url: string): Promise<string[]> {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [{ table }] = await sql<{ table: string | null }[]>`
      select to_regclass(${`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`})::text as table`
    if (!table) return []
    const rows = await sql<{ name: string }[]>`select name from ${sql(MIGRATION_SCHEMA)}.${sql(MIGRATION_TABLE)}`
    return rows.map((r) => r.name)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function main() {
  loadDevEnv()
  const raw = migrationDatabaseUrl()
  if (!raw) throw new Error("Set DATABASE_URL")
  const url = new URL(raw)
  const target = decodeURIComponent(url.pathname.slice(1))
  const base = process.env.BASE_DATABASE || "pokefindr"
  if (target === base) return

  const admin = postgres(withDatabase(url, "postgres"), { max: 1, onnotice: () => {} })
  try {
    const exists = async (name: string) => (await admin`select 1 from pg_database where datname = ${name}`).length > 0
    if (await exists(target)) return

    const branchMigrations = readdirSync(MIGRATIONS_DIR)
      .filter((f) => MIGRATION_FILE.test(f))
      .map((f) => f.slice(0, -".ts".length))
    const copy = (await exists(base)) && canCopyBase(await appliedMigrations(withDatabase(url, base)), branchMigrations)

    if (!copy) {
      await admin`create database ${admin(target)}`
      console.log(`Created an empty database ${target}: ${base} has migrations this branch doesn't.`)
      return
    }

    // A template can't have other connections, e.g. the web container still
    // running from the previous branch. It's about to be replaced anyway.
    for (let attempt = 1; ; attempt++) {
      await admin`select pg_terminate_backend(pid) from pg_stat_activity where datname = ${base} and pid <> pg_backend_pid()`
      try {
        await admin`create database ${admin(target)} template ${admin(base)}`
        break
      } catch (err) {
        if (attempt === 3 || !(err instanceof Error) || !/being accessed by other users/.test(err.message)) throw err
        await new Promise((resolve) => setTimeout(resolve, 500))
      }
    }
    console.log(`Created database ${target} as a copy of ${base}.`)
  } finally {
    await admin.end({ timeout: 5 })
  }
}

// Run only as a script, not when a test imports canCopyBase.
if (process.argv[1]?.endsWith("branchDatabase.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
