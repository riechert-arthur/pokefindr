/**
 * Loads the fixture locations in database/seeds/locations.json and a few
 * sample events (labelled as samples, each at an event location) so a local
 * database isn't empty, then refreshes the per-state counts. On a local
 * database it also adds the dev accounts, one per role
 * (scripts/db/seedDevUsers.ts). Safe to run repeatedly (see seedLocations,
 * seedSampleHighlights and seedDevUsers).
 *
 *   npm run db:seed    (make run runs it in the init container)
 */
import { loadDevEnv, migrationClient, migrationDatabaseUrl } from "./env"
import { readSeedLocations, seedLocations } from "./seedLocations"
import { seedSampleHighlights } from "./seedHighlights"
import { DEV_PASSWORD, isLocalDatabase, seedDevUsers } from "./seedDevUsers"

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
    if (isLocalDatabase(migrationDatabaseUrl())) {
      const seeded = await seedDevUsers(sql)
      const added = seeded.filter((s) => s.outcome === "added").length
      console.log(`Dev accounts: ${added} added, ${seeded.length - added} already there. Password for all: ${DEV_PASSWORD}`)
      for (const { account, outcome } of seeded) {
        console.log(`  ${account.email.padEnd(30)} ${account.role}${outcome === "unchanged" ? "" : ` (${outcome})`}`)
      }
    } else {
      console.log("Not a local database: no dev accounts.")
    }
  } finally {
    await sql.end({ timeout: 5 })
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
