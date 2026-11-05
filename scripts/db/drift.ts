/**
 * Drift check: does the database the migrations built match the Drizzle schema
 * (src/server/db/schema)?
 *
 * Asks drizzle-kit what `push` would run against the database, without running
 * it. An empty list means they match. Used by `npm run db:check` and the
 * integration tests, so CI fails if the schema and migrations drift apart.
 *
 * Like the baseline check (scripts/db/schemaCheck.ts), it ignores what the
 * schema deliberately doesn't model: the objects in UNMODELLED, row-level
 * security and its policies, and foreign keys into other schemas (Supabase's
 * `auth`). Otherwise it would suggest dropping live objects on Supabase.
 */
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { pushSchema } from "drizzle-kit/api"
import { CompiledQuery, sql, type Kysely } from "kysely"
import * as schema from "../../src/server/db/schema"

/** Tables and views in production's `public` schema that src/server/db/schema leaves out on purpose. */
export const UNMODELLED = [
  "spatial_ref_sys", // PostGIS
  "Vending Machine Locations", // legacy
  "active_subscriptions",
  "latest_status_reports",
  "location_rating_summary",
  "user_trust_summary",
]

/** Statements about things the schema doesn't model; see the file comment. */
const ROW_LEVEL_SECURITY = /^ALTER TABLE "[^"]+" (?:ENABLE|DISABLE) ROW LEVEL SECURITY;\s*$|^(?:CREATE|ALTER|DROP) POLICY /
const DROP_CONSTRAINT = /^ALTER TABLE "([^"]+)" DROP CONSTRAINT "([^"]+)";\s*$/

/**
 * drizzle-kit can't read custom column types back from the database, so it
 * always wants to "change" geography columns to the type they already have.
 * Those statements are dropped, but only after checking the column really has
 * that type.
 */
const GEOGRAPHY_ALTER = /^ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" SET DATA TYPE "undefined"\."geography\(point, 4326\)";$/

/**
 * Runs `fn` with drizzle-kit's progress spinner silenced, and with stdin
 * reported as non-interactive, so an ambiguous diff (a rename?) fails at once
 * instead of waiting on a prompt nobody can see.
 */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const write = process.stdout.write
  const isTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY")
  process.stdout.write = (() => true) as typeof process.stdout.write
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true })
  try {
    return await fn()
  } catch (err) {
    if (err instanceof Error && err.message.startsWith("Interactive prompts require a TTY")) {
      throw new Error(
        "drizzle-kit can't tell whether something in src/server/db/schema was renamed or replaced in the database " +
          "(a table, column or enum that exists on one side under a different name). Write the migration for the " +
          "rename (for example db.schema.alterTable(...).renameColumn(...)), run it, and check again.",
        { cause: err },
      )
    }
    throw err
  } finally {
    process.stdout.write = write
    if (isTTY) Object.defineProperty(process.stdin, "isTTY", isTTY)
    else delete (process.stdin as { isTTY?: boolean }).isTTY
  }
}

/** Returns the SQL drizzle-kit would run to make the database match the schema; empty means no drift. */
export async function schemaDrift(db: Kysely<unknown>): Promise<string[]> {
  // drizzle-kit only needs execute(), returning node-postgres-style { rows }.
  const dialect = new PgDialect()
  const executor = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query)
      return db.executeQuery(CompiledQuery.raw(text, params))
    },
  }
  const { statementsToExecute } = await quietly(() =>
    pushSchema(schema, executor as never, ["public"], UNMODELLED.map((name) => `!${name}`), ["postgis"]),
  )

  const drift: string[] = []
  for (const statement of statementsToExecute) {
    if (ROW_LEVEL_SECURITY.test(statement)) continue

    const dropped = DROP_CONSTRAINT.exec(statement)
    if (dropped) {
      const [, table, name] = dropped
      const { rows } = await sql<{ external: boolean }>`
        select rn.nspname <> 'public' as external from pg_constraint con
        join pg_class rc on rc.oid = con.confrelid join pg_namespace rn on rn.oid = rc.relnamespace
        where con.contype = 'f' and con.conname = ${name} and con.conrelid = ${`public."${table}"`}::regclass`.execute(db)
      if (rows[0]?.external) continue
    }

    const geography = GEOGRAPHY_ALTER.exec(statement)
    if (geography) {
      const [, table, column] = geography
      const { rows } = await sql<{ type: string }>`
        select format_type(a.atttypid, a.atttypmod) as type from pg_attribute a
        where a.attrelid = ${`public."${table}"`}::regclass and a.attname = ${column}`.execute(db)
      if (rows[0] && /^(?:\w+\.)?geography\(Point,4326\)$/.test(rows[0].type)) continue
    }

    drift.push(statement.trim())
  }
  return drift
}
