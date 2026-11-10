/**
 * Loads the fixture locations in database/seeds/locations.json and a few
 * sample events (labelled as samples, each at an event location) so a local
 * database isn't empty, then refreshes the per-state counts. On a local
 * database it also adds the dev accounts, one per role
 * (scripts/db/seedDevUsers.ts), and a few sample submissions and a report
 * from them (scripts/db/seedModeration.ts). Safe to run repeatedly (see
 * seedLocations, seedSampleHighlights, seedDevUsers and seedSampleModeration).
 *
 *   npm run db:seed    (make run runs it in the init container)
 */
import { loadDevEnv, migrationClient, migrationDatabaseUrl } from "./env"
import { readSeedLocations, seedLocations } from "./seedLocations"
import { seedSampleHighlights } from "./seedHighlights"
import { DEV_PASSWORD, isLocalDatabase, seedDevUsers } from "./seedDevUsers"
import { seedSampleModeration } from "./seedModeration"

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
      const counts = new Map<string, number>()
      for (const { outcome } of seeded) counts.set(outcome, (counts.get(outcome) ?? 0) + 1)
      const summary = [...counts].map(([outcome, n]) => `${n} ${outcome}`).join(", ")
      console.log(`Dev accounts: ${summary}. Password for all: ${DEV_PASSWORD}`)
      for (const { account, outcome } of seeded) {
        console.log(`  ${account.email.padEnd(30)} ${account.role}${outcome === "unchanged" ? "" : ` (${outcome})`}`)
      }
      console.log(`Sample submissions and reports: ${await seedSampleModeration(sql)} added.`)
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
