/**
 * Makes sure the database in DATABASE_URL exists and still fits this branch's
 * migrations. The init container runs this before migrating (see "Branch
 * databases" in docs/database.md).
 *
 * Each git branch has its own local database. The first time a branch runs, its
 * database is copied from main's (BASE_DATABASE), so it starts with main's
 * migrations and data. If main's database has a migration this branch doesn't
 * (main moved on after the branch was cut), or one that differs from the
 * branch's file, a copy wouldn't fit, so the branch starts from an empty
 * database instead.
 *
 * Kysely knows applied migrations only by name, so the migrator also records a
 * hash of each one (scripts/db/migrator.ts). If a branch database has applied a
 * migration that has since changed or left the branch (common while a PR is in
 * review), it is dropped and created again, as on the branch's first run.
 * main's database is only warned about: it's the one with your data.
 */
import postgres from "postgres"
import { loadDevEnv, migrationDatabaseUrl } from "./env"
import { MIGRATION_HASH_TABLE, MIGRATION_SCHEMA, MIGRATION_TABLE, migrationFileHashes } from "./migrator"

/**
 * Why a database's applied migrations don't fit the branch's, or [] if they do.
 * `applied` maps each applied migration to the hash recorded when it ran
 * (null if it ran before hashes were kept). `files` maps the branch's files to their hashes.
 */
export function staleReasons(applied: Map<string, string | null>, files: Map<string, string>): string[] {
  const reasons: string[] = []
  for (const [name, hash] of applied) {
    const file = files.get(name)
    if (file === undefined) reasons.push(`${name} was applied but isn't on this branch`)
    else if (hash !== null && hash !== file) reasons.push(`${name} has changed since it was applied`)
  }
  return reasons
}

function withDatabase(url: URL, database: string): string {
  const copy = new URL(url)
  copy.pathname = `/${database}`
  return copy.toString()
}

/** Each migration applied to the database at `url`, with the hash recorded when it ran (null if none was). */
async function appliedMigrations(url: string): Promise<Map<string, string | null>> {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const [found] = await sql<{ migrations: string | null; hashes: string | null }[]>`
      select to_regclass(${`${MIGRATION_SCHEMA}.${MIGRATION_TABLE}`})::text as migrations,
             to_regclass(${`${MIGRATION_SCHEMA}.${MIGRATION_HASH_TABLE}`})::text as hashes`
    if (!found.migrations) return new Map()
    const migrations = sql`${sql(MIGRATION_SCHEMA)}.${sql(MIGRATION_TABLE)}`
    const rows = found.hashes
      ? await sql<{ name: string; hash: string | null }[]>`
          select m.name, h.hash from ${migrations} m
          left join ${sql(MIGRATION_SCHEMA)}.${sql(MIGRATION_HASH_TABLE)} h using (name)`
      : await sql<{ name: string; hash: null }[]>`select name, null as hash from ${migrations}`
    return new Map(rows.map((r) => [r.name, r.hash]))
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
  const files = migrationFileHashes()

  const admin = postgres(withDatabase(url, "postgres"), { max: 1, onnotice: () => {} })
  try {
    const exists = async (name: string) => (await admin`select 1 from pg_database where datname = ${name}`).length > 0

    if (target === base) {
      if (!(await exists(base))) {
        await admin`create database ${admin(base)}`
        console.log(`Created an empty database ${base}.`)
        return
      }
      for (const reason of staleReasons(await appliedMigrations(raw), files)) {
        console.warn(`Warning: in ${base}, ${reason}. make fresh rebuilds it, deleting its data.`)
      }
      return
    }

    if (await exists(target)) {
      const reasons = staleReasons(await appliedMigrations(raw), files)
      if (reasons.length === 0) return
      console.log(`Rebuilding ${target}: ${reasons.join("; ")}.`)
      await admin`drop database ${admin(target)} with (force)`
    }

    const whyNotCopy = (await exists(base))
      ? staleReasons(await appliedMigrations(withDatabase(url, base)), files).map((r) => `in ${base}, ${r}`)
      : [`${base} doesn't exist yet`]

    if (whyNotCopy.length) {
      await admin`create database ${admin(target)}`
      console.log(`Created an empty database ${target}: ${whyNotCopy.join("; ")}.`)
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

// Run only as a script, not when a test imports staleReasons.
if (process.argv[1]?.endsWith("branchDatabase.ts")) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
