/**
 * Loads the fixture locations in database/seeds/locations.json and a few
 * sample events (labelled as samples, each at an event location) so a local
 * database isn't empty, then refreshes the per-state counts. Safe to run
 * repeatedly (see seedLocations and seedSampleHighlights).
 *
 *   npm run db:seed    (make run runs it in the init container)
 */
import { loadDevEnv, migrationClient } from "./env"
import { readSeedLocations, seedLocations } from "./seedLocations"
import { seedSampleHighlights } from "./seedHighlights"

loadDevEnv()

async function main() {
  const sql = migrationClient()
  try {
    const { added, updated, unchanged } = await seedLocations(sql, readSeedLocations())
    console.log(`Seed locations: ${added} added, ${updated} updated, ${unchanged} unchanged.`)
    console.log(`Sample events: ${await seedSampleHighlights(sql)} added.`)
    // As the refresh-region-counts job does, so state counts include the new rows.
    await sql`refresh materialized view location_region_counts`
    console.log("Refreshed location_region_counts.")
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
