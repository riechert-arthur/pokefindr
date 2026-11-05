/**
 * Applies, rolls back or lists migrations in database/migrations (see scripts/db/migrator.ts).
 *
 *   npm run db:migrate                 # apply every pending migration
 *   npm run db:rollback                # undo the last applied migration
 *   npm run db:rollback -- --to <tag>  # undo every migration after <tag>
 *   npm run db:status                  # list migrations and when each was applied
 */
import { loadDevEnv, migrationClient } from "./env"
import { createMigrator, throwIfFailed } from "./migrator"

loadDevEnv()

function argAfter(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  return i === -1 ? undefined : process.argv[i + 1]
}

async function main() {
  const command = process.argv[2] ?? "up"
  if (!["up", "down", "status"].includes(command)) throw new Error(`Unknown command "${command}" (expected up, down or status)`)

  const sql = migrationClient()
  const { migrator } = createMigrator(sql)
  try {
    if (command === "status") {
      for (const m of await migrator.getMigrations()) {
        console.log(`${m.executedAt ? `applied ${m.executedAt.toISOString()}` : "pending                         "}  ${m.name}`)
      }
      return
    }

    let result
    if (command === "up") {
      result = await migrator.migrateToLatest()
    } else {
      const to = argAfter("--to")
      if (process.argv.includes("--to") && !to) throw new Error("--to needs a migration tag, e.g. --to 0000_baseline")
      if (to) {
        const target = (await migrator.getMigrations()).find((m) => m.name === to)
        if (!target) throw new Error(`No migration named ${to}`)
        if (!target.executedAt) throw new Error(`${to} isn't applied, so there's nothing to roll back to`)
      }
      result = to ? await migrator.migrateTo(to) : await migrator.migrateDown()
    }

    for (const r of result.results ?? []) {
      if (r.status === "Success") console.log(`${r.direction === "Up" ? "applied" : "rolled back"} ${r.migrationName}`)
    }
    throwIfFailed(result)
    if (!result.results?.length) console.log(command === "up" ? "Nothing to apply." : "Nothing to roll back.")
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
