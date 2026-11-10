/**
 * The moderation eval (#253, docs/moderation.md):
 *
 *   npm run eval:moderation -- [--provider claude|fake] [--cases <id,…>] [--out <dir>]
 *
 * Runs the labelled cases in evals/moderation/cases.yaml through the
 * moderator and prints, per category, precision and recall, the share of
 * clean reviews flagged, the share of abusive cases caught, and what the
 * run cost. `--provider fake` is free; the default, claude, calls Claude
 * Haiku with ANTHROPIC_API_KEY (use a separate, spend-limited key): about
 * 90 calls, roughly $0.01 for the whole set. No database needed. Exits 1
 * when a target is missed.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import { loadDevEnv } from "../db/env"

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const usd = (micros: number) => `$${(micros / 1e6).toFixed(4)}`

async function main() {
  loadDevEnv()
  const provider = arg("provider", "claude")
  if (provider !== "claude" && provider !== "fake") throw new Error("--provider must be claude or fake")
  process.env.MODERATION_PROVIDER = provider
  // The app's config needs these to parse; the eval uses neither.
  process.env.APP_URL ??= "http://localhost:3000"
  process.env.JWT_SECRET ??= "moderation-eval"

  const { getServerConfig } = await import("@/server/config")
  const { makeModerator } = await import("@/server/container")
  const { gate, loadCases, runCases, summarize } = await import("../../evals/moderation/runner")

  const config = getServerConfig()
  const moderator = makeModerator(config)
  const only = arg("cases")?.split(",")
  const cases = loadCases().filter((c) => !only || only.includes(c.id))
  console.log(`${cases.length} cases on ${provider === "claude" ? config.MODERATION_MODEL : "the fake (keyword rules)"}\n`)

  const results = await runCases(moderator, cases, (r) => {
    const right = r.got.failed ? "ERROR" : r.expected.flag === (r.got.verdict !== "allow") ? "ok   " : "MISS "
    console.log(`${right} ${r.id.padEnd(13)} ${r.got.verdict.padEnd(5)} ${r.got.categories.join(",")}${right === "ok   " ? "" : `  ${r.got.reason}`}`)
  })
  const s = summarize(results)

  const out = arg("out", "evals/moderation/results")!
  mkdirSync(out, { recursive: true })
  const file = path.join(out, `${new Date().toISOString().replace(/[:.]/g, "-")}-${provider}.json`)
  writeFileSync(file, JSON.stringify({ provider, model: provider === "claude" ? config.MODERATION_MODEL : "fake", summary: s, results }, null, 2))

  console.log(`\nClean reviews flagged: ${s.cleanReviewsFlagged.n}/${s.cleanReviewsFlagged.of} (${pct(s.cleanReviewsFlagged.rate)}) · abusive caught: ${s.abusiveCaught.n}/${s.abusiveCaught.of} (${pct(s.abusiveCaught.rate)})`)
  console.log(`Flag precision ${pct(s.flag.precision)}, recall ${pct(s.flag.recall)} · ${s.failedChecks} failed checks`)
  console.table(Object.fromEntries(Object.entries(s.byCategory).map(([k, v]) => [k, { precision: pct(v.precision), recall: pct(v.recall), cases: v.support }])))
  console.log(`Cost ${usd(s.costMicros)} · latency p50 ${s.latencyMs.p50} ms, p95 ${s.latencyMs.p95} ms`)
  console.log(`Report: ${file}`)
  const problems = gate(s)
  if (problems.length) {
    console.error(`\nMissed: ${problems.join("; ")}`)
    process.exitCode = 1
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
