/**
 * The assistant eval (#208):
 *
 *   EVAL_DATABASE_URL=postgres://…/pokefindr_eval npm run eval:assistant -- [options]
 *
 *   --cases smoke|all|<id,…>   which cases (default all)
 *   --reps <n>                 runs per case (default 1)
 *   --judge                    also grade helpfulness with claude-haiku-5-5
 *   --baseline <file>          fail if the pass rate drops 5+ points below it
 *   --out <dir>                where reports go (default evals/assistant/results)
 *   --max-cost-usd <n>         stop starting cases past this spend (default 5)
 *
 * Calls the Claude API with ANTHROPIC_API_KEY, so every run costs money: use
 * a separate, spend-limited key (#209). EVAL_DATABASE_URL must name a
 * migrated database whose name contains "eval" or "test": the run empties
 * it and seeds evals/assistant/fixtures.ts. Exits 1 when grounding is below
 * 100% or the pass rate falls more than 5 points below the baseline.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import postgres from "postgres"
import { loadDevEnv } from "../db/env"

const arg = (name: string, fallback?: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i > 0 ? process.argv[i + 1] : fallback
}
const pct = (x: number) => `${(x * 100).toFixed(1)}%`
const usd = (micros: number) => `$${(micros / 1e6).toFixed(2)}`

async function main() {
  loadDevEnv()
  const url = process.env.EVAL_DATABASE_URL
  if (!url) throw new Error("Set EVAL_DATABASE_URL to a migrated database for the eval (it gets emptied).")
  if (!/(eval|test)/i.test(new URL(url).pathname)) throw new Error("EVAL_DATABASE_URL's database name must contain 'eval' or 'test': the run empties it.")
  // Everything below reads the eval database.
  process.env.DATABASE_URL = url

  const { getServerConfig } = await import("@/server/config")
  const { getDb } = await import("@/server/db/client")
  const { getAnthropic } = await import("@/server/container")
  const { getClaude } = await import("@/server/assistant/run")
  const { FakeGeocoder } = await import("@/server/adapters/geocoder/fake")
  const { seedEvalData } = await import("../../evals/assistant/fixtures")
  const { gate, loadCases, runEval } = await import("../../evals/assistant/runner")

  const config = getServerConfig()
  const claude = getClaude()
  if (!claude) throw new Error("Set ANTHROPIC_API_KEY (a separate, spend-limited key) to run the eval.")
  const cases = loadCases(arg("cases", "all"))
  const reps = Number(arg("reps", "1"))
  const sql = postgres(url, { max: 1, onnotice: () => {} })
  try {
    const now = new Date()
    await seedEvalData(sql, now)
    console.log(`${cases.length} cases × ${reps} on ${config.ASSISTANT_MODEL} (effort ${config.ASSISTANT_EFFORT})\n`)
    const report = await runEval({
      cases,
      reps,
      claude,
      model: config.ASSISTANT_MODEL,
      effort: config.ASSISTANT_EFFORT,
      db: getDb(),
      sql,
      geocoder: new FakeGeocoder(),
      judgeClient: process.argv.includes("--judge") ? getAnthropic() : null,
      now,
      maxCostMicros: Number(arg("max-cost-usd", "5")) * 1e6,
      onRow: (r) =>
        console.log("checks" in r ? `${r.pass ? "pass" : "FAIL"}  ${r.id}${r.pass ? "" : `  ${r.checks.flatMap((c) => c.reasons).join("; ")}`}` : `ERROR ${r.id}  ${r.kind}: ${r.message}`),
    })

    const out = arg("out", "evals/assistant/results")!
    mkdirSync(out, { recursive: true })
    const stamp = report.startedAt.replace(/[:.]/g, "-")
    writeFileSync(path.join(out, `${stamp}.json`), JSON.stringify(report, null, 2))
    writeFileSync(path.join(out, `${stamp}.errors.jsonl`), report.errors.map((e) => JSON.stringify(e)).join("\n"))

    const s = report.summary
    console.log(`\nPass ${pct(s.passRate)} of ${s.graded} graded · grounding ${pct(s.groundingRate)} · ${report.errors.length} errors`)
    console.table(Object.fromEntries(Object.entries(s.byCategory).map(([k, v]) => [k, { pass: v.pass, total: v.total, rate: pct(v.pass / v.total) }])))
    console.log(`Tokens in ${s.usage.inputTokens + s.usage.cacheReadTokens + s.usage.cacheWriteTokens} (cache read ${s.usage.cacheReadTokens}), out ${s.usage.outputTokens}`)
    console.log(`Cost ${usd(s.usage.costMicros)} (+ judge ${usd(s.judgeUsage.costMicros)}) · latency p50 ${s.latencyMs.p50} ms, p95 ${s.latencyMs.p95} ms${s.helpful ? ` · helpful ${s.helpful.toFixed(2)}/5` : ""}`)
    console.log(`Report: ${path.join(out, `${stamp}.json`)}`)

    const baselineFile = arg("baseline")
    const baseline = baselineFile ? (JSON.parse(readFileSync(baselineFile, "utf8")) as { summary: { passRate: number } }).summary : null
    const problems = gate(report, baseline)
    if (problems.length) {
      console.error(`\nFailed: ${problems.join("; ")}`)
      process.exitCode = 1
    }
  } finally {
    await sql.end({ timeout: 5 })
    const { closeDb } = await import("@/server/db/client")
    await closeDb()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exitCode = 1
})
