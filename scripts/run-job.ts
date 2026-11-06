/**
 * Runs a job locally through the same registry the cron route and queue
 * consumer use:
 *
 *   npm run job -- <name> [json-payload]
 *   npm run job -- noop '{"hello":"world"}'
 *
 * Loads .env files like `next dev`. Runs with `--conditions=react-server`
 * (see package.json) so modules marked `server-only` can be imported.
 */
import { loadDevEnv } from "./db/env"

async function main() {
  loadDevEnv()
  const [name, rawPayload] = process.argv.slice(2)
  const { jobs } = await import("@/server/lib/jobs/registry")
  if (!name) {
    console.error("Usage: npm run job -- <name> [json-payload]\n\nJobs:")
    for (const [jobName, job] of Object.entries(jobs)) console.error(`  ${jobName.padEnd(20)} ${job.description}`)
    process.exit(2)
  }

  let payload: unknown = null
  if (rawPayload) {
    try {
      payload = JSON.parse(rawPayload)
    } catch {
      console.error("The payload must be JSON, e.g. '{\"id\":\"abc\"}'")
      process.exit(2)
    }
  }

  const { runJob } = await import("@/server/lib/jobs/run")
  const result = await runJob(name, payload, { trigger: "cli" })
  console.log(JSON.stringify(result, null, 2))
}

// Close the db pool (if a job opened one) so the process exits instead of
// waiting on idle connections.
async function closeResources() {
  const { closeDb } = await import("@/server/db/client")
  await closeDb().catch(() => {})
}

main()
  .then(async () => {
    await closeResources()
    process.exit(0)
  })
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err)
    await closeResources()
    process.exit(1)
  })
