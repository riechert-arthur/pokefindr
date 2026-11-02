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

/** Empties every application table (keeps the schema and migrations). */
export async function truncateAll(url = testDatabaseUrl()) {
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const tables = await sql<{ tablename: string }[]>`
      select tablename from pg_tables
      where schemaname = 'public' and tablename <> 'spatial_ref_sys'`
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ")
      await sql.unsafe(`truncate ${list} restart identity cascade`)
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}
