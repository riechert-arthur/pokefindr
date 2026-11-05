import postgres from "postgres"

const DEFAULT_TEST_DATABASE_URL = "postgres://pokefindr:pokefindr@localhost:5433/pokefindr_test"

/** The throwaway database integration tests run against. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL || DEFAULT_TEST_DATABASE_URL
  const name = new URL(url).pathname.slice(1)
  // Tests drop and recreate this database; refuse anything that isn't clearly a test DB.
  if (!name.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL must point at a database ending in "_test" (got "${name}")`)
  }
  return url
}

// One connection and one TRUNCATE statement per test file, reused by every test.
let connection: postgres.Sql | undefined
let truncateStatement: string | null | undefined

/** Empties every application table (keeps the schema and migrations). */
export async function truncateAll() {
  connection ??= postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
  if (truncateStatement === undefined) {
    const tables = await connection<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> 'spatial_ref_sys'`
    truncateStatement = tables.length
      ? `truncate ${tables.map((t) => `"public"."${t.tablename}"`).join(", ")} restart identity cascade`
      : null
  }
  if (truncateStatement) await connection.unsafe(truncateStatement)
}

/** Closes the connection `truncateAll` opened. Call once per file, after all tests. */
export async function closeTestConnection() {
  await connection?.end({ timeout: 5 })
  connection = undefined
  truncateStatement = undefined
}
