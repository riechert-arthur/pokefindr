/**
 * Makes sure the database in DATABASE_URL exists. The init container runs this
 * before migrating (see "Branch databases" in docs/database.md).
 *
 * Each git branch has its own local database. The first time a branch runs, its
 * database is copied from main's (BASE_DATABASE), so it starts with main's
 * migrations and data. If main's database has a migration this branch doesn't
 * (main moved on after the branch was cut), a copy would fail Kysely's
 * missing-migration check, so the branch starts from an empty database instead.
 *
 * Kysely knows applied migrations only by name, so it can't tell when a branch
 * changes one after its database ran it (common while a PR is in review). So
 * this also keeps a SHA-256 of each migration file as it was when applied
 * (`--record`, run by init after migrating). If a branch database has applied
 * a migration that has since changed or disappeared from the branch, it is
 * dropped and created again, as on the branch's first run.
 *
 *   npx tsx scripts/db/branchDatabase.ts            # before db:migrate
 *   npx tsx scripts/db/branchDatabase.ts --record   # after db:migrate
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { loadDevEnv, migrationDatabaseUrl } from "./env"
import { MIGRATION_FILE, MIGRATION_SCHEMA, MIGRATION_TABLE, MIGRATIONS_DIR } from "./migrator"

/** Local-only bookkeeping next to Kysely's table: each applied migration's file hash. */
const HASH_TABLE = "dev_migration_hashes"

/** A branch database can start as a copy only if every migration applied to the base exists on this branch. */
export function canCopyBase(appliedOnBase: string[], branchMigrations: string[]): boolean {
  const onBranch = new Set(branchMigrations)
  return appliedOnBase.every((name) => onBranch.has(name))
}

/**
 * Why a branch database no longer fits the branch's migrations, or [] if it does.
 * `applied` maps each applied migration to the hash recorded when it ran
 * (null when it ran before hashes were kept). `files` maps the branch's files to their hashes.
 */
export function staleReasons(applied: Map<string, string | null>, files: Map<string, string>): string[] {
  const reasons: string[] = []
  for (const [name, hash] of applied) {
    const file = files.get(name)
    if (file === undefined) reasons.push(`${name} was applied but isn't on this branch any more`)
    else if (hash !== null && hash !== file) reasons.push(`${name} changed after this database applied it`)
  }
  return reasons
}

function migrationFileHashes(): Map<string, string> {
  return new Map(
    readdirSync(MIGRATIONS_DIR)
      .filter((f) => MIGRATION_FILE.test(f))
      .map((f) => [
        f.slice(0, -".ts".length),
        createHash("sha256")
          .update(readFileSync(path.join(MIGRATIONS_DIR, f)))
          .digest("hex"),
      ])
  )
}

function withDatabase(url: URL, database: string): string {
  const copy = new URL(url)
  copy.pathname = `/${database}`
  return copy.toString()
}

async function tableExists(sql: postgres.Sql, table: string): Promise<boolean> {
  const [row] = await sql<
    { table: string | null }[]
  >`select to_regclass(${`${MIGRATION_SCHEMA}.${table}`})::text as table`
  return row.table !== null
}

/** Each applied migration, with the file hash recorded when it ran (null if none was). */
async function appliedMigrations(url: string): Promise<Map<string, string | null>> {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    if (!(await tableExists(sql, MIGRATION_TABLE))) return new Map()
    const hashes = await tableExists(sql, HASH_TABLE)
    const rows = hashes
      ? await sql<{ name: string; hash: string | null }[]>`
          select m.name, h.hash from ${sql(MIGRATION_SCHEMA)}.${sql(MIGRATION_TABLE)} m
          left join ${sql(MIGRATION_SCHEMA)}.${sql(HASH_TABLE)} h on h.name = m.name`
      : await sql<
          { name: string; hash: null }[]
        >`select name, null as hash from ${sql(MIGRATION_SCHEMA)}.${sql(MIGRATION_TABLE)}`
    return new Map(rows.map((r) => [r.name, r.hash]))
  } finally {
    await sql.end({ timeout: 5 })
  }
}

/**
 * Records the hash of each applied migration that has none yet. Existing rows
 * are kept, so a hash always describes the file as it was when it ran.
 */
async function recordHashes(url: string) {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    if (!(await tableExists(sql, MIGRATION_TABLE))) return
    await sql`create table if not exists ${sql(MIGRATION_SCHEMA)}.${sql(HASH_TABLE)} (name text primary key, hash text not null)`
    const applied = new Set(
      (await sql<{ name: string }[]>`select name from ${sql(MIGRATION_SCHEMA)}.${sql(MIGRATION_TABLE)}`).map(
        (r) => r.name
      )
    )
    const rows = [...migrationFileHashes()]
      .filter(([name]) => applied.has(name))
      .map(([name, hash]) => ({ name, hash }))
    if (rows.length)
      await sql`insert into ${sql(MIGRATION_SCHEMA)}.${sql(HASH_TABLE)} ${sql(rows)} on conflict (name) do nothing`
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
  if (process.argv.includes("--record")) return recordHashes(raw)
  const base = process.env.BASE_DATABASE || "pokefindr"
  const files = migrationFileHashes()

  if (target === base) {
    // main's database is never rebuilt automatically: it's the one with your data.
    const reasons = staleReasons(await appliedMigrations(raw), files)
    for (const reason of reasons) console.warn(`Warning: ${reason}. Run make fresh to rebuild ${base}.`)
    return
  }

  const admin = postgres(withDatabase(url, "postgres"), {
    max: 1,
    onnotice: () => {},
  })
  try {
    const exists = async (name: string) => (await admin`select 1 from pg_database where datname = ${name}`).length > 0
    if (await exists(target)) {
      const reasons = staleReasons(await appliedMigrations(raw), files)
      if (reasons.length === 0) return
      console.log(`Rebuilding ${target}: ${reasons.join("; ")}.`)
      await admin`drop database ${admin(target)} with (force)`
    }

    const baseExists = await exists(base)
    const copy =
      baseExists && canCopyBase([...(await appliedMigrations(withDatabase(url, base))).keys()], [...files.keys()])

    if (!copy) {
      await admin`create database ${admin(target)}`
      const why = baseExists ? `${base} has migrations this branch doesn't` : `${base} doesn't exist yet`
      console.log(`Created an empty database ${target}: ${why}.`)
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
