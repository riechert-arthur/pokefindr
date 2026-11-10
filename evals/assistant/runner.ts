/**
 * Runs the assistant eval: each case through the app's own turn loop
 * (runAssistantTurn, the same prompt, tools and settings as /api/assistant)
 * against the seeded fixtures, then the graders, then an optional
 * model-graded rubric. Infrastructure failures (API errors, timeouts) are
 * kept apart from graded results so they never count as wrong answers.
 */
import { readFileSync } from "node:fs"
import { parse } from "yaml"
import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import * as z4 from "zod/v4"
import type postgres from "postgres"
import type { Database } from "@/server/db/client"
import type { Geocoder } from "@/server/ports/geocoder"
import { PROMPT_VERSION, emptyUsage, runAssistantTurn, type ClaudeStreamer } from "@/server/assistant/run"
import { costMicros } from "@/server/assistant/pricing"
import type { AssistantEvent, AssistantUsage } from "@/lib/types/assistant-stream"
import { FIXTURE_NAMES } from "./fixtures"
import type { ContentModerator } from "@/server/ports/moderator"
import { addCheckUsage, checkQuestion, emitBlocked } from "@/server/assistant/moderation"
import { gradeCase, type CheckResult, type EvalCase, type ToolTrace } from "./grade"

export const CASES_FILE = new URL("./cases.yaml", import.meta.url)

/** The cases, filtered: "all", "smoke", or a comma-separated list of ids. */
export function loadCases(which = "all", file: URL | string = CASES_FILE): EvalCase[] {
  const { cases } = parse(readFileSync(file, "utf8")) as { cases: EvalCase[] }
  if (which === "all") return cases
  if (which === "smoke") return cases.filter((c) => c.smoke)
  const ids = new Set(which.split(","))
  const picked = cases.filter((c) => ids.has(c.id))
  const missing = [...ids].filter((id) => !picked.some((c) => c.id === id))
  if (missing.length) throw new Error(`No case with id ${missing.join(", ")}`)
  return picked
}

/** Replaces `{{id:EV-PDX-3}}` (a machine id) and `{{id:SHOP:Kanto Card Hall}}` (a name) with the seeded rows' ids. */
export async function resolveIds(text: string, sql: postgres.Sql): Promise<string> {
  let out = text
  for (const m of text.matchAll(/\{\{id:([^}]+)\}\}/g)) {
    const key = m[1]
    const [row] = key.startsWith("SHOP:")
      ? await sql<{ id: string }[]>`select id from locations where name = ${key.slice(5)}`
      : await sql<{ id: string }[]>`select id from locations where "machineID" = ${key}`
    if (!row) throw new Error(`Fixture ${key} not found`)
    out = out.replace(m[0], row.id)
  }
  return out
}

export interface JudgeResult {
  helpful: number
  concise: number
  reason: string
  usage: AssistantUsage
}

export const JUDGE_MODEL = "claude-haiku-5-5"

const JudgeSchema = z4.object({
  helpful: z4.number().int().min(1).max(5),
  concise: z4.number().int().min(1).max(5),
  reason: z4.string(),
})

/**
 * The model-graded rubric, for what the checks can't see: is the answer
 * helpful and short, as the prompt asks? Facts are the checks' job; the
 * judge sees the tool results only to judge usefulness.
 */
export async function judge(client: Anthropic, c: EvalCase, answer: string, tools: readonly ToolTrace[]): Promise<JudgeResult> {
  const res = await client.messages.parse({
    model: JUDGE_MODEL,
    max_tokens: 2000,
    output_config: { format: zodOutputFormat(JudgeSchema), effort: "low" },
    messages: [
      {
        role: "user",
        content: `You grade answers from a map assistant for Pokémon card vending machines, card shops and events in the US. Its answers should be 1–4 short sentences that point to the best one or two results and suggest a next step; the page shows full results as cards, so it shouldn't repeat every row. It must not claim stock or prices, and should redirect questions it can't help with.

Rate the answer: helpful (1–5: does it answer what was asked, or redirect well?) and concise (1–5: short and to the point?), with a one-sentence reason.

<question>${c.question}</question>
<tool_results>${JSON.stringify(tools.map((t) => ({ tool: t.name, ok: t.ok, data: t.data ?? t.error })))}</tool_results>
<answer>${answer}</answer>`,
      },
    ],
  })
  const parsed = res.parsed_output
  if (!parsed) throw new Error(`The judge returned no rating (stop: ${res.stop_reason})`)
  const usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens, cacheReadTokens: res.usage.cache_read_input_tokens ?? 0, cacheWriteTokens: res.usage.cache_creation_input_tokens ?? 0, costMicros: 0 }
  usage.costMicros = costMicros(res.model, usage)
  return { ...parsed, usage }
}

export interface EvalRow {
  id: string
  category: string
  rep: number
  pass: boolean
  /** "truncated" answers hit max_tokens: shown, but not counted as wrong. */
  status: "graded" | "truncated"
  stop: string
  /** The input check blocked the question; undefined when the run had no moderator. */
  blocked?: boolean
  checks: CheckResult[]
  answer: string
  tools: ToolTrace[]
  usage: AssistantUsage
  latencyMs: number
  judge?: JudgeResult
}

export interface EvalError {
  id: string
  rep: number
  kind: "api" | "timeout" | "judge"
  message: string
}

export interface EvalReport {
  model: string
  effort: string
  promptVersion: string
  startedAt: string
  rows: EvalRow[]
  errors: EvalError[]
  summary: {
    graded: number
    passRate: number
    groundingRate: number
    byCategory: Record<string, { pass: number; total: number }>
    usage: AssistantUsage
    judgeUsage: AssistantUsage
    latencyMs: { p50: number; p95: number }
    helpful?: number
  }
}

export interface RunOptions {
  cases: EvalCase[]
  reps: number
  claude: ClaudeStreamer
  model: string
  effort: "low" | "medium" | "high" | "xhigh" | "max"
  db: Database
  sql: postgres.Sql
  geocoder: Geocoder
  /** The judge's client; none skips the rubric. */
  judgeClient?: Anthropic | null
  now?: Date
  /** Per (case, rep) wall-clock ceiling. */
  timeoutMs?: number
  /** Checks each question first, as /api/assistant does (#253); blocked ones never reach the model. None skips the check. */
  moderator?: ContentModerator | null
  /** Stops before starting another case once spend passes this. */
  maxCostMicros?: number
  onRow?: (row: EvalRow | EvalError) => void
}

const add = (a: AssistantUsage, b: AssistantUsage): AssistantUsage => ({
  inputTokens: a.inputTokens + b.inputTokens,
  outputTokens: a.outputTokens + b.outputTokens,
  cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
  cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  costMicros: a.costMicros + b.costMicros,
})

const percentile = (xs: number[], p: number) => {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}

export async function runEval(o: RunOptions): Promise<EvalReport> {
  const now = o.now ?? new Date()
  const rows: EvalRow[] = []
  const errors: EvalError[] = []
  let spent = 0
  for (const c of o.cases) {
    for (let rep = 1; rep <= o.reps; rep++) {
      if (o.maxCostMicros !== undefined && spent >= o.maxCostMicros) {
        const e: EvalError = { id: c.id, rep, kind: "api", message: "skipped: the run's cost cap was reached" }
        errors.push(e)
        o.onRow?.(e)
        continue
      }
      const history = await Promise.all((c.history ?? []).map(async (h) => ({ role: h.role, content: await resolveIds(h.content, o.sql) })))
      const tools: ToolTrace[] = []
      const usage = emptyUsage()
      let answer = ""
      let done: Extract<AssistantEvent, { type: "done" }> | null = null
      let failure: string | null = null
      const signal = AbortSignal.timeout(o.timeoutMs ?? 90_000)
      const started = Date.now()
      let blocked: boolean | undefined
      const emit = (e: AssistantEvent) => {
        if (e.type === "text") answer += e.text
        if (e.type === "done") done = e
        if (e.type === "error") failure = e.message
      }
      try {
        const check = o.moderator ? await checkQuestion(c.question, { moderator: o.moderator }) : null
        if (check) addCheckUsage(usage, check)
        blocked = check ? check.verdict === "block" && !check.failed : undefined
        if (blocked) emitBlocked(emit, usage, check!.model)
        else
          await runAssistantTurn({
            claude: o.claude,
            model: o.model,
            effort: o.effort,
            history: [...history, { role: "user", content: c.question }],
            tools: { db: o.db, geocoder: o.geocoder, viewer: c.viewer ?? null, now, signal },
            emit,
            signal,
            usage,
            onTool: (t) => tools.push(t),
          })
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err)
      }
      spent += usage.costMicros
      if (failure || !done) {
        const e: EvalError = { id: c.id, rep, kind: signal.aborted ? "timeout" : "api", message: failure ?? "the turn ended without a result" }
        errors.push(e)
        o.onRow?.(e)
        continue
      }
      const stop = (done as Extract<AssistantEvent, { type: "done" }>).stop
      const checks = gradeCase(c, answer, tools, FIXTURE_NAMES, blocked)
      const row: EvalRow = {
        id: c.id,
        category: c.category,
        rep,
        pass: checks.every((x) => x.pass),
        status: stop === "max_tokens" ? "truncated" : "graded",
        stop,
        blocked,
        checks,
        answer,
        tools,
        usage: { ...usage },
        latencyMs: Date.now() - started,
      }
      if (o.judgeClient) {
        try {
          row.judge = await judge(o.judgeClient, c, answer, tools)
        } catch (err) {
          errors.push({ id: c.id, rep, kind: "judge", message: err instanceof Error ? err.message : String(err) })
        }
      }
      rows.push(row)
      o.onRow?.(row)
    }
  }
  const graded = rows.filter((r) => r.status === "graded")
  const byCategory: EvalReport["summary"]["byCategory"] = {}
  for (const r of graded) {
    byCategory[r.category] ??= { pass: 0, total: 0 }
    byCategory[r.category].total++
    if (r.pass) byCategory[r.category].pass++
  }
  const judged = rows.filter((r) => r.judge)
  return {
    model: o.model,
    effort: o.effort,
    promptVersion: PROMPT_VERSION,
    startedAt: now.toISOString(),
    rows,
    errors,
    summary: {
      graded: graded.length,
      passRate: graded.length ? graded.filter((r) => r.pass).length / graded.length : 0,
      groundingRate: graded.length ? graded.filter((r) => r.checks.find((x) => x.name === "grounding")?.pass).length / graded.length : 0,
      byCategory,
      usage: rows.reduce((u, r) => add(u, r.usage), emptyUsage()),
      judgeUsage: judged.reduce((u, r) => add(u, r.judge!.usage), emptyUsage()),
      latencyMs: { p50: percentile(rows.map((r) => r.latencyMs), 50), p95: percentile(rows.map((r) => r.latencyMs), 95) },
      ...(judged.length ? { helpful: judged.reduce((n, r) => n + r.judge!.helpful, 0) / judged.length } : {}),
    },
  }
}

/** Whether a run is good enough to merge against a baseline: grounding at 100%, and the pass rate within 5 points. */
/** More of the attempts than this failing to run (API errors, timeouts, a tool that threw) fails the run. */
export const MAX_ERROR_SHARE = 0.1

export function gate(report: EvalReport, baseline: { passRate: number } | null): string[] {
  const problems: string[] = []
  if (report.summary.graded === 0) problems.push("no case was graded")
  // Cases that never produced an answer aren't graded, so a broken tool could otherwise leave only the easy ones.
  const failed = report.errors.filter((e) => e.kind !== "judge").length
  const attempts = failed + report.rows.length
  if (attempts && failed / attempts > MAX_ERROR_SHARE) problems.push(`${failed} of ${attempts} attempts didn't run (more than ${MAX_ERROR_SHARE * 100}%)`)
  if (report.summary.groundingRate < 1) problems.push(`grounding is ${(report.summary.groundingRate * 100).toFixed(1)}%, not 100%`)
  if (baseline && report.summary.passRate < baseline.passRate - 0.05)
    problems.push(`pass rate ${(report.summary.passRate * 100).toFixed(1)}% is more than 5 points below the baseline's ${(baseline.passRate * 100).toFixed(1)}%`)
  return problems
}
