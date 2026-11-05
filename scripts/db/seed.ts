/**
 * Loads the fixture locations in database/seeds/locations.json so a local
 * database isn't empty. Safe to run repeatedly (see seedLocations).
 *
 *   npm run db:seed    (make seed runs it against the local database)
 */
import { loadDevEnv, migrationClient } from "./env"
import { readSeedLocations, seedLocations } from "./seedLocations"

loadDevEnv()

async function main() {
  const sql = migrationClient()
  try {
    const { added, updated, unchanged } = await seedLocations(sql, readSeedLocations())
    console.log(`Seed locations: ${added} added, ${updated} updated, ${unchanged} unchanged.`)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
