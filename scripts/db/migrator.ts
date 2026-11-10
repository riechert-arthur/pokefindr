/**
 * Runs migrations with Kysely's Migrator.
 *
 * Each migration is a TypeScript file in database/migrations, named
 * `<NNNN>_<description>.ts`, that exports `up(db)` and usually `down(db)`,
 * written with Kysely's schema builder. They run in name order.
 *
 * Kysely records each one by name in kysely.kysely_migration, runs everything
 * pending in one transaction under a lock, and refuses to run if an applied
 * migration is missing or a new one sorts before the last applied one,
 * instead of skipping it.
 *
 * A migration without `down` can't be rolled back: rolling it back throws,
 * rather than Kysely's default of forgetting it without undoing it.
 * The baseline has no `down` on purpose; reset a local database instead.
 *
 * Kysely knows applied migrations only by name, so each one also records a
 * hash of its file (MIGRATION_HASH_TABLE), in the same transaction that runs
 * it; rolling back deletes it. Local branch databases use these to notice a
 * migration that changed after it ran (scripts/db/branchDatabase.ts).
 */
import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Kysely, Migrator, sql as kysql, type Migration, type Transaction } from "kysely"
import ts from "typescript"
import { PostgresJSDialect } from "kysely-postgres-js"
import type { Sql } from "postgres"
import { ROOT_DIR } from "./env"

export const MIGRATIONS_DIR = path.join(ROOT_DIR, "database/migrations")

/** Kysely's bookkeeping lives outside `public`, so Supabase's API doesn't expose it. */
export const MIGRATION_SCHEMA = "kysely"
export const MIGRATION_TABLE = "kysely_migration"
export const MIGRATION_HASH_TABLE = "kysely_migration_hash"

/** `hash` is set for migrations loaded from files; tests' own migrations go without. */
export type Migrations = Record<string, Migration & { hash?: string }>

export const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.ts$/

/**
 * Hash of a migration's code, ignoring comments, formatting and line endings,
 * so only an edit that could change what it does gives a new hash.
 */
export function migrationHash(source: string): string {
  const js = ts.transpileModule(source, {
    compilerOptions: { removeComments: true, target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
  }).outputText
  // Whitespace only matters between two word characters (`await db`).
  const tokens = js.replace(/\s+/g, " ").replace(/ ?([^\w$ ]) ?/g, "$1").trim()
  return createHash("sha256").update(tokens).digest("hex")
}

/** The hash of each migration file in `dir`, keyed by name without `.ts`. */
export function migrationFileHashes(dir = MIGRATIONS_DIR): Map<string, string> {
  return new Map(
    readdirSync(dir)
      .filter((f) => MIGRATION_FILE.test(f))
      .map((f) => [f.slice(0, -".ts".length), migrationHash(readFileSync(path.join(dir, f), "utf8"))]),
  )
}

/** Loads every migration in `dir`, keyed by file name without `.ts`. */
export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<Migrations> {
  const migrations: Migrations = {}
  const hashes = migrationFileHashes(dir)
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) {
    if (!MIGRATION_FILE.test(file)) throw new Error(`${file}: migration files are named like 0001_add_thing.ts`)
    const name = file.slice(0, -".ts".length)
    const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as Partial<Migration>
    if (typeof mod.up !== "function") throw new Error(`${file} doesn't export up()`)
    migrations[name] = { up: mod.up, down: mod.down, hash: hashes.get(name) }
  }
  return migrations
}

const hashTable = kysql.table(`${MIGRATION_SCHEMA}.${MIGRATION_HASH_TABLE}`)

async function ensureHashTable(db: Kysely<unknown>) {
  await kysql`create table if not exists ${hashTable} (name text primary key, hash text not null)`.execute(db)
}

/**
 * Records each migration's hash as it runs and forgets it on rollback, and
 * makes rolling back a migration without down() fail, instead of Kysely
 * silently forgetting it.
 */
function wrap(migrations: Migrations): Record<string, Migration> {
  return Object.fromEntries(
    Object.entries(migrations).map(([name, { up, down, hash }]) => [
      name,
      {
        up: async (db) => {
          await up(db)
          if (!hash) return
          await ensureHashTable(db)
          await kysql`insert into ${hashTable} (name, hash) values (${name}, ${hash})
            on conflict (name) do update set hash = excluded.hash`.execute(db)
        },
        down: async (db) => {
          if (!down) throw new Error(`${name} can't be rolled back: it has no down().`)
          await down(db)
          await ensureHashTable(db)
          await kysql`delete from ${hashTable} where name = ${name}`.execute(db)
        },
      },
    ]),
  )
}

/**
 * Wraps a postgres.js connection in Kysely and a Migrator.
 * `migrations` defaults to database/migrations; tests pass their own.
 * The caller owns `sql` and closes it; `db.destroy()` would close it too.
 */
export function createMigrator(sql: Sql, migrations?: Migrations) {
  const db = new Kysely<unknown>({ dialect: new PostgresJSDialect({ postgres: sql }) })
  const migrator = new Migrator({
    db,
    provider: { getMigrations: async () => wrap(migrations ?? (await loadMigrations())) },
    migrationTableSchema: MIGRATION_SCHEMA,
    migrationTableName: MIGRATION_TABLE,
  })
  return { db, migrator }
}

class RolledBack extends Error {}

/** Runs `fn` in a transaction that is always rolled back, and returns its result. */
export async function inRolledBackTransaction<T>(
  db: Kysely<unknown>,
  fn: (trx: Transaction<unknown>) => Promise<T>,
): Promise<T> {
  let result: T | undefined
  try {
    await db.transaction().execute(async (trx) => {
      result = await fn(trx)
      throw new RolledBack()
    })
  } catch (err) {
    if (!(err instanceof RolledBack)) throw err
  }
  return result as T
}

/** Throws the migrator's error, naming the migration that failed. */
export function throwIfFailed(result: Awaited<ReturnType<Migrator["migrateToLatest"]>>) {
  if (!result.error) return
  const failed = result.results?.find((r) => r.status === "Error")
  const err = result.error instanceof Error ? result.error : new Error(String(result.error))
  if (failed) err.message = `${failed.migrationName} (${failed.direction.toLowerCase()}) failed: ${err.message}`
  throw err
}
