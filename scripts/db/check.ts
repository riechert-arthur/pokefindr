/**
 * Checks that the database matches the Drizzle schema (src/server/db/schema).
 *
 *   npm run db:migrate && npm run db:check
 *
 * Prints what drizzle-kit would change if they differ, which is a good
 * starting point for the migration you still need to write.
 */
import { schemaDrift } from "./drift"
import { loadDevEnv, migrationClient } from "./env"
import { createMigrator } from "./migrator"

loadDevEnv()

async function main() {
  const sql = migrationClient()
  try {
    const drift = await schemaDrift(createMigrator(sql).db)
    if (drift.length === 0) {
      console.log("The database matches src/server/db/schema.")
      return
    }
    console.error("The database doesn't match src/server/db/schema. drizzle-kit would run:\n")
    for (const statement of drift) console.error(`  ${statement}`)
    console.error("\nWrite a migration in database/migrations for this (or fix the schema).")
    process.exitCode = 1
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
