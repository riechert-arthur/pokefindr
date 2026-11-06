/**
 * Runs the location import by hand. Migration 0002_import_locations already
 * runs it on every database; use this to rerun it, preview it, or import
 * another file of the same shape.
 *
 *   npm run db:import-locations                    # dry run: rolled back
 *   npm run db:import-locations -- --apply         # write
 *   npm run db:import-locations -- --file <geojson> --report <json>
 */
import { writeFileSync } from "node:fs"
import { loadDevEnv, migrationClient } from "../../db/env"
import { createMigrator, inRolledBackTransaction } from "../../db/migrator"
import { DEFAULT_FILE, importLocations, summarize } from "."

function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i === -1) return undefined
  const value = process.argv[i + 1]
  if (!value || value.startsWith("--")) throw new Error(`${flag} needs a value`)
  return value
}

async function main() {
  loadDevEnv()
  const file = argValue("--file") ?? DEFAULT_FILE
  const apply = process.argv.includes("--apply")

  const sql = migrationClient()
  const { db } = createMigrator(sql)
  try {
    const run = (trx: Parameters<typeof importLocations>[0]) => importLocations(trx, file)
    const report = apply ? await db.transaction().execute(run) : await inRolledBackTransaction(db, run)
    for (const line of summarize(report)) console.log(line)
    const reportFile = argValue("--report")
    if (reportFile) writeFileSync(reportFile, JSON.stringify({ apply, ...report }, null, 2) + "\n")
    console.log(apply ? "Done." : "Dry run: nothing written. Re-run with --apply to write.")
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
