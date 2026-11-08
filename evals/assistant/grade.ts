/**
 * Deterministic graders for the assistant's eval (#208). Each check looks at
 * the final answer and the turn's tool calls and returns failures as short
 * reasons; an empty list passes. They run before any model-graded rubric.
 */

export interface EvalExpect {
  tools?: { name: string; input?: Record<string, string | number> }[]
  noTools?: boolean
  maxListed?: number
  mentions?: string[]
  notMentions?: string[]
}

export interface EvalCase {
  id: string
  category: string
  question: string
  history?: { role: "user" | "assistant"; content: string }[]
  viewer?: { lng: number; lat: number }
  smoke?: boolean
  expect: EvalExpect
}

export interface ToolTrace {
  name: string
  input: unknown
  ok: boolean
  error?: string
  data?: Record<string, unknown>
}

export interface CheckResult {
  name: string
  pass: boolean
  reasons: string[]
}

const re = (pattern: string) => new RegExp(pattern, "i")

/** Whether a tool input value matches the expected one: a regex for strings (arrays match on any item), equality for numbers. */
function inputMatches(actual: unknown, expected: string | number): boolean {
  if (typeof expected === "number") return actual === expected
  if (Array.isArray(actual)) return actual.some((a) => inputMatches(a, expected))
  return typeof actual === "string" && re(expected).test(actual)
}

export function checkTools(expect: EvalExpect, tools: readonly ToolTrace[]): CheckResult {
  const reasons: string[] = []
  if (expect.noTools && tools.length) reasons.push(`expected no tools, got ${tools.map((t) => t.name).join(", ")}`)
  for (const want of expect.tools ?? []) {
    // A call that failed (bad input, no match) doesn't count as making it.
    const hit = tools.some((t) => t.ok && t.name === want.name && Object.entries(want.input ?? {}).every(([k, v]) => inputMatches((t.input as Record<string, unknown> | null)?.[k], v)))
    if (!hit) reasons.push(`expected ${want.name}${want.input ? ` with ${JSON.stringify(want.input)}` : ""}`)
  }
  return { name: "tools", pass: reasons.length === 0, reasons }
}

export function checkMentions(expect: EvalExpect, answer: string): CheckResult {
  const reasons = [
    ...(expect.mentions ?? []).filter((p) => !re(p).test(answer)).map((p) => `should mention /${p}/`),
    ...(expect.notMentions ?? []).filter((p) => re(p).test(answer)).map((p) => `shouldn't mention /${p}/`),
  ]
  return { name: "mentions", pass: reasons.length === 0, reasons }
}

/** Street addresses as an answer would write them: "1550 Colfax Ave". */
const ADDRESS = /\b\d{1,6}\s+(?:[A-Z][a-z]+\s){0,3}(?:St|Ave|Blvd|Rd|Dr|Way|Ln|Pkwy|Hwy|Broadway|Street|Avenue|Boulevard|Road|Drive)\b\.?/g
/** Counts of places: "5 vending machines", "1,457 places". */
const COUNT = /\b(\d[\d,]*)\s+(?:vending machines?|machines?|places|locations|card shops?|shops?|events?|stores?)\b/gi

/**
 * Grounding: every known place name, address and count in the answer must
 * appear in what the tools returned this turn. A name from the data set
 * that no tool returned, or an address or count from nowhere, is made up.
 */
export function checkGrounding(answer: string, tools: readonly ToolTrace[], knownNames: readonly string[], question: string): CheckResult {
  const returned = JSON.stringify(tools.map((t) => t.data ?? null)).toLowerCase()
  const asked = question.toLowerCase()
  const reasons: string[] = []
  for (const name of knownNames) {
    const n = name.toLowerCase()
    if (answer.toLowerCase().includes(n) && !returned.includes(n) && !asked.includes(n)) reasons.push(`mentions "${name}", which no tool returned`)
  }
  for (const m of answer.matchAll(ADDRESS)) {
    const address = m[0].replace(/\.$/, "")
    if (!returned.includes(address.toLowerCase()) && !asked.includes(address.toLowerCase())) reasons.push(`address "${address}" isn't in the tool results`)
  }
  const numbers = new Set([...returned.matchAll(/(?<![\w.])\d+(?:\.\d+)?(?![\w.])/g)].map((m) => m[0]))
  for (const m of answer.matchAll(COUNT)) {
    const n = m[1].replace(/,/g, "")
    if (!numbers.has(n) && !asked.includes(m[1])) reasons.push(`count "${m[0]}" isn't in the tool results`)
  }
  return { name: "grounding", pass: reasons.length === 0, reasons }
}

const STOCK_CLAIM = /\b(in stock|out of stock|sold out|fully stocked|restocks? (?:on|every|at|around)|restocked (?:on|every|at|around)|freshly restocked)\b|\$\s?\d/i
/** A negation or doubt that, before a claim in the same clause, makes it a non-claim ("can't tell if it's in stock"). */
const HEDGE = /(?:\b(?:no|not|never|whether|if|unknown|cannot|without)\b|n't\b)/i
/** Clauses: a hedge in one ("It's not far, ...") says nothing about the next ("... it restocks every Tuesday"). */
const CLAUSE = /[,;:]|\b(?:but|and|although|though|so)\b/i
const STOCK_CLAIM_ALL = new RegExp(STOCK_CLAIM.source, "gi")

/** A clause that's only another item of a list of claims ("…, out of stock, or sold out"): it shares the hedge before it. */
const LIST_ITEM = new RegExp(`^\\s*(?:or|and)?\\s*(?:it'?s|it is|is|are)?\\s*(?:${STOCK_CLAIM.source})\\s*[.!?]?\\s*$`, "i")

/** Whether every stock or price claim in the sentence is hedged within its own clause (or is a list item after a hedged one). */
const hedged = (sentence: string) => {
  let covered = false
  return sentence.split(CLAUSE).every((clause = "") => {
    if (covered && LIST_ITEM.test(clause)) return true
    covered = false
    let ok = true
    for (const m of clause.matchAll(STOCK_CLAIM_ALL)) {
      if (HEDGE.test(clause.slice(0, m.index))) covered = true
      else ok = false
    }
    return ok
  })
}

/** No claims about stock, restocks or prices: the data has none. A hedged sentence ("I can't tell whether it's in stock") is fine. */
export function checkStockClaims(answer: string): CheckResult {
  const reasons = answer
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((s) => STOCK_CLAIM.test(s) && !hedged(s))
    .map((s) => `claims stock or price: "${s.trim().slice(0, 80)}"`)
  return { name: "no_stock_claims", pass: reasons.length === 0, reasons }
}

/** No links in the text: cards carry them. */
export function checkLinks(answer: string): CheckResult {
  const links = answer.match(/https?:\/\/\S+|www\.\S+|\b[a-z0-9-]+\.(?:com|net|org|example|io)\b/gi) ?? []
  return { name: "no_links", pass: links.length === 0, reasons: links.map((l) => `links to ${l}`) }
}

/** At most `max` places listed in one find_places call (the tool's cap holds). */
export function checkListed(expect: EvalExpect, tools: readonly ToolTrace[]): CheckResult {
  if (expect.maxListed === undefined) return { name: "listed", pass: true, reasons: [] }
  const most = Math.max(0, ...tools.filter((t) => t.name === "find_places").map((t) => ((t.data?.places as unknown[]) ?? []).length))
  return { name: "listed", pass: most <= expect.maxListed, reasons: most > expect.maxListed ? [`listed ${most} places`] : [] }
}

/** Every check for one case. */
export function gradeCase(c: EvalCase, answer: string, tools: readonly ToolTrace[], knownNames: readonly string[]): CheckResult[] {
  return [
    checkTools(c.expect, tools),
    checkMentions(c.expect, answer),
    checkGrounding(answer, tools, knownNames, [c.question, ...(c.history ?? []).map((h) => h.content)].join("\n")),
    checkStockClaims(answer),
    checkLinks(answer),
    checkListed(c.expect, tools),
  ]
}
