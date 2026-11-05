/**
 * Drift check: does the database the migrations built match the Drizzle schema
 * (src/server/db/schema)?
 *
 * Asks drizzle-kit what `push` would run against the database, without running
 * it. An empty list means they match. Used by `npm run db:check` and the
 * integration tests, so CI fails if the schema and migrations drift apart.
 */
import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { pushSchema } from "drizzle-kit/api"
import type { Sql, TransactionSql } from "postgres"
import * as schema from "../../src/server/db/schema"

/**
 * drizzle-kit can't read custom column types back from the database, so it
 * always wants to "change" geography columns to the type they already have.
 * Those statements are dropped, but only after checking the column really has
 * that type.
 */
const GEOGRAPHY_ALTER = /^ALTER TABLE "([^"]+)" ALTER COLUMN "([^"]+)" SET DATA TYPE "undefined"\."geography\(point, 4326\)";$/

/** Runs `fn` with drizzle-kit's progress spinner silenced. */
async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const write = process.stdout.write
  process.stdout.write = (() => true) as typeof process.stdout.write
  try {
    return await fn()
  } finally {
    process.stdout.write = write
  }
}

/** Returns the SQL drizzle-kit would run to make the database match the schema; empty means no drift. */
export async function schemaDrift(sql: Sql | TransactionSql): Promise<string[]> {
  // drizzle-kit only needs execute(), returning node-postgres-style { rows }.
  // Compiling the query here works on a transaction too, which drizzle(tx) doesn't.
  const dialect = new PgDialect()
  const db = {
    execute: async (query: SQL) => {
      const { sql: text, params } = dialect.sqlToQuery(query)
      return { rows: await sql.unsafe(text, params as never[]) }
    },
  }
  const { statementsToExecute } = await quietly(() =>
    pushSchema(schema, db as never, ["public"], ["!spatial_ref_sys"], ["postgis"]),
  )

  const drift: string[] = []
  for (const statement of statementsToExecute) {
    const geography = GEOGRAPHY_ALTER.exec(statement)
    if (geography) {
      const [, table, column] = geography
      const [row] = await sql<{ type: string }[]>`
        select format_type(a.atttypid, a.atttypmod) as type from pg_attribute a
        where a.attrelid = ${`public."${table}"`}::regclass and a.attname = ${column}`
      if (row && /^(?:\w+\.)?geography\(Point,4326\)$/.test(row.type)) continue
    }
    drift.push(statement)
  }
  return drift
}
