/**
 * The moderation eval (#253): runs a ContentModerator over the hand-labelled
 * cases and scores it. The CLI is scripts/moderation/eval.ts.
 */
import { readFileSync } from "node:fs"
import { parse } from "yaml"
import { MODERATION_CATEGORIES, type ContentModerator, type ModerationCategory, type ModerationKind, type ModerationResult } from "@/server/ports/moderator"

export const CASES_FILE = new URL("./cases.yaml", import.meta.url)

export interface ModerationCase {
  id: string
  kind: Extract<ModerationKind, "review" | "question">
  group: "clean" | "slang" | "borderline" | "abusive" | "injection"
  /** Should be held or blocked. */
  flag: boolean
  categories: ModerationCategory[]
  text: string
  context?: string
}

export function loadCases(file: URL | string = CASES_FILE): ModerationCase[] {
  const { cases } = parse(readFileSync(file, "utf8")) as { cases: ModerationCase[] }
  return cases
}

export interface CaseResult {
  id: string
  kind: ModerationCase["kind"]
  group: ModerationCase["group"]
  expected: { flag: boolean; categories: ModerationCategory[] }
  got: Pick<ModerationResult, "verdict" | "categories" | "reason" | "failed">
  costMicros: number
  latencyMs: number
}

export interface Rate {
  /** Of `of`, how many. */
  n: number
  of: number
  rate: number
}

export interface EvalSummary {
  /** Clean and slang reviews that were flagged: the target is under 5%. */
  cleanReviewsFlagged: Rate
  /** Abusive and injection cases (reviews and questions) that were flagged: the target is 95% or more. */
  abusiveCaught: Rate
  /** Flag or not, against the labels, over every case. */
  flag: { precision: number; recall: number }
  /** Per category, among flagged cases: did the verdict name it? */
  byCategory: Record<string, { precision: number; recall: number; support: number }>
  failedChecks: number
  costMicros: number
  latencyMs: { p50: number; p95: number }
}

export const TARGETS = { cleanReviewsFlaggedBelow: 0.05, abusiveCaughtAtLeast: 0.95 }

const rate = (n: number, of: number): Rate => ({ n, of, rate: of ? n / of : 0 })
const ratio = (a: number, b: number) => (b ? a / b : 1)
const flagged = (r: CaseResult) => r.got.verdict !== "allow"
const percentile = (xs: number[], p: number) => {
  const s = [...xs].sort((a, b) => a - b)
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0
}

/** Runs every case, one at a time (the set is small, and it keeps the cost predictable). */
export async function runCases(moderator: ContentModerator, cases: readonly ModerationCase[], onResult?: (r: CaseResult) => void): Promise<CaseResult[]> {
  const out: CaseResult[] = []
  for (const c of cases) {
    const started = Date.now()
    let got: ModerationResult
    try {
      got = await moderator.check(c.text, { kind: c.kind, context: c.context, signal: AbortSignal.timeout(30_000) })
    } catch (err) {
      got = { verdict: "hold", categories: [], reason: err instanceof Error ? err.message : String(err), model: "none", promptVersion: "none", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0 }, failed: true }
    }
    const r: CaseResult = {
      id: c.id,
      kind: c.kind,
      group: c.group,
      expected: { flag: c.flag, categories: c.categories },
      got: { verdict: got.verdict, categories: got.categories, reason: got.reason, failed: got.failed },
      costMicros: got.usage.costMicros,
      latencyMs: Date.now() - started,
    }
    out.push(r)
    onResult?.(r)
  }
  return out
}

/** Scores results against their labels. Failed checks count as not flagged, so an outage can't pass the eval. */
export function summarize(results: readonly CaseResult[]): EvalSummary {
  const ok = results.map((r) => ({ ...r, flaggedOk: !r.got.failed && flagged(r) }))
  const cleanReviews = ok.filter((r) => r.kind === "review" && (r.group === "clean" || r.group === "slang"))
  const abusive = ok.filter((r) => r.group === "abusive" || r.group === "injection")
  const tp = ok.filter((r) => r.expected.flag && r.flaggedOk).length
  const fp = ok.filter((r) => !r.expected.flag && r.flaggedOk).length
  const fn = ok.filter((r) => r.expected.flag && !r.flaggedOk).length
  const byCategory: EvalSummary["byCategory"] = {}
  for (const cat of MODERATION_CATEGORIES) {
    const has = (xs: readonly ModerationCategory[]) => xs.includes(cat)
    const ctp = ok.filter((r) => has(r.expected.categories) && r.flaggedOk && has(r.got.categories)).length
    const cfp = ok.filter((r) => !has(r.expected.categories) && r.flaggedOk && has(r.got.categories)).length
    const cfn = ok.filter((r) => has(r.expected.categories) && !(r.flaggedOk && has(r.got.categories))).length
    const support = ok.filter((r) => has(r.expected.categories)).length
    if (support || cfp) byCategory[cat] = { precision: ratio(ctp, ctp + cfp), recall: ratio(ctp, ctp + cfn), support }
  }
  const latencies = results.map((r) => r.latencyMs)
  return {
    cleanReviewsFlagged: rate(cleanReviews.filter((r) => r.flaggedOk).length, cleanReviews.length),
    abusiveCaught: rate(abusive.filter((r) => r.flaggedOk).length, abusive.length),
    flag: { precision: ratio(tp, tp + fp), recall: ratio(tp, tp + fn) },
    byCategory,
    failedChecks: results.filter((r) => r.got.failed).length,
    costMicros: results.reduce((n, r) => n + r.costMicros, 0),
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
  }
}

/** What missed a target, if anything. */
export function gate(s: EvalSummary): string[] {
  const problems: string[] = []
  if (s.cleanReviewsFlagged.rate >= TARGETS.cleanReviewsFlaggedBelow)
    problems.push(`${(s.cleanReviewsFlagged.rate * 100).toFixed(1)}% of clean reviews were flagged (target under ${TARGETS.cleanReviewsFlaggedBelow * 100}%)`)
  if (s.abusiveCaught.rate < TARGETS.abusiveCaughtAtLeast)
    problems.push(`${(s.abusiveCaught.rate * 100).toFixed(1)}% of abusive cases were caught (target ${TARGETS.abusiveCaughtAtLeast * 100}%)`)
  return problems
}
