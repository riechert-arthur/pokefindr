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
 */
import { readdirSync } from "node:fs"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { Kysely, Migrator, type Migration, type Transaction } from "kysely"
import { PostgresJSDialect } from "kysely-postgres-js"
import type { Sql } from "postgres"
import { ROOT_DIR } from "./env"

export const MIGRATIONS_DIR = path.join(ROOT_DIR, "database/migrations")

/** Kysely's bookkeeping lives outside `public`, so Supabase's API doesn't expose it. */
export const MIGRATION_SCHEMA = "kysely"
export const MIGRATION_TABLE = "kysely_migration"

export type Migrations = Record<string, Migration>

export const MIGRATION_FILE = /^\d{4}_[a-z0-9_]+\.ts$/

/** Loads every migration in `dir`, keyed by file name without `.ts`. */
export async function loadMigrations(dir = MIGRATIONS_DIR): Promise<Migrations> {
  const migrations: Migrations = {}
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts")).sort()) {
    if (!MIGRATION_FILE.test(file)) throw new Error(`${file}: migration files are named like 0001_add_thing.ts`)
    const name = file.slice(0, -".ts".length)
    const mod = (await import(pathToFileURL(path.join(dir, file)).href)) as Partial<Migration>
    if (typeof mod.up !== "function") throw new Error(`${file} doesn't export up()`)
    migrations[name] = { up: mod.up, down: mod.down }
  }
  return migrations
}

/** Makes rolling back a migration without down() fail, instead of Kysely silently forgetting it. */
function requireDown(migrations: Migrations): Migrations {
  return Object.fromEntries(
    Object.entries(migrations).map(([name, { up, down }]) => [
      name,
      {
        up,
        down: async (db) => {
          if (!down) throw new Error(`${name} can't be rolled back: it has no down().`)
          await down(db)
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
    provider: { getMigrations: async () => requireDown(migrations ?? (await loadMigrations())) },
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
