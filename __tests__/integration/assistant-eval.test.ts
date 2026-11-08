import { describe, expect, it } from "vitest"
import postgres from "postgres"
import Anthropic from "@anthropic-ai/sdk"
import { getDb } from "@/server/db/client"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { ASSISTANT_TOOLS } from "@/server/assistant/tools"
import { FIXTURE_PLACES, seedEvalData } from "../../evals/assistant/fixtures"
import { gate, loadCases, resolveIds, runEval } from "../../evals/assistant/runner"
import { fakeClaude, type Step } from "./fakeClaude"
import { testDatabaseUrl } from "./testDatabase"

const now = new Date("2026-11-08T12:00:00Z")

async function withSql<T>(fn: (sql: postgres.Sql) => Promise<T>): Promise<T> {
  const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
  try {
    return await fn(sql)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

describe("the eval set", () => {
  it("has 'nothing found' and count patterns that the question alone can't satisfy", () => {
    const cases = loadCases("find-none-houston,events-none-chicago,stats-count-colorado,stats-shops-seattle")
    for (const c of cases) for (const p of c.expect.mentions ?? []) expect(new RegExp(p, "i").test(c.question), `${c.id}: /${p}/`).toBe(false)
    const shops = new RegExp(cases.find((c) => c.id === "stats-shops-seattle")!.expect.mentions![0], "i")
    expect(shops.test("There are none.")).toBe(false)
    expect(shops.test("No one has added a card shop around Seattle yet.")).toBe(false)
    expect(shops.test("There's one card shop: Kanto Card Hall.")).toBe(true)
  })

  it("is well formed: unique ids, known tools, valid patterns, ids that resolve, a smoke set in every category", async () => {
    const cases = loadCases()
    expect(cases.length).toBeGreaterThanOrEqual(40)
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
    const tools = new Set(ASSISTANT_TOOLS.map((t) => t.name))
    for (const c of cases) {
      for (const t of c.expect.tools ?? []) expect(tools.has(t.name), `${c.id}: ${t.name}`).toBe(true)
      for (const p of [...(c.expect.mentions ?? []), ...(c.expect.notMentions ?? []), ...(c.expect.tools ?? []).flatMap((t) => Object.values(t.input ?? {}).filter((v) => typeof v === "string"))]) expect(() => new RegExp(p as string, "i")).not.toThrow()
    }
    const smoke = loadCases("smoke")
    expect(new Set(smoke.map((c) => c.category))).toEqual(new Set(cases.map((c) => c.category).filter((k) => k !== "followup")))
    await withSql(async (sql) => {
      await seedEvalData(sql, now)
      for (const c of cases) for (const h of c.history ?? []) expect(await resolveIds(h.content, sql)).not.toMatch(/\{\{id:/)
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from locations`
      expect(n).toBe(FIXTURE_PLACES.length)
    })
  })
})

describe("the runner", () => {
  /** A known-good transcript per case, and the same cases answered with nothing. */
  const ORACLE: Record<string, Step[]> = {
    "find-portland-5mi": [{ tools: [{ name: "find_places", input: { near: "Portland, OR", radius_miles: 5 } }] }, { text: "**Greenleaf Market** on Alder St is closest." }],
    "events-phoenix": [{ tools: [{ name: "list_events", input: { near: "Phoenix, AZ" } }] }, { text: "**Prerelease night** is coming up in Phoenix." }],
    "offtopic-poem": [{ text: "I can only help find Pokémon card machines, shops and events." }],
  }
  const cases = loadCases(Object.keys(ORACLE).join(","))

  it("passes a known-good run and fails an empty one (the harness works)", async () => {
    await withSql(async (sql) => {
      await seedEvalData(sql, now)
      const steps = cases.flatMap((c) => ORACLE[c.id])
      const run = (claude: ReturnType<typeof fakeClaude>["claude"]) =>
        runEval({ cases, reps: 1, claude, model: "claude-opus-5-5", effort: "medium", db: getDb(), sql, geocoder: new FakeGeocoder(), now })

      const good = await run(fakeClaude(steps).claude)
      expect(good.rows.map((r) => [r.id, r.pass, r.checks.flatMap((c) => c.reasons)])).toEqual(cases.map((c) => [c.id, true, []]))
      expect(good.summary).toMatchObject({ graded: 3, passRate: 1, groundingRate: 1, byCategory: { find: { pass: 1, total: 1 } } })
      expect(good.summary.usage.costMicros).toBeGreaterThan(0)
      expect(gate(good, { passRate: 1 })).toEqual([])

      const empty = await run(fakeClaude(cases.map(() => ({ text: " " }))).claude)
      expect(empty.summary.passRate).toBe(0)
      expect(gate(empty, { passRate: 1 })).toEqual([expect.stringContaining("more than 5 points below")])

      // Cases that never ran don't make the rest look good.
      const broken = { ...good, errors: [{ id: "x", rep: 1, kind: "api" as const, message: "boom" }, { id: "y", rep: 1, kind: "api" as const, message: "boom" }] }
      expect(gate(broken, null)).toEqual([expect.stringContaining("2 of 5 attempts didn't run")])
    })
  })

  it("keeps API failures apart from graded answers", async () => {
    await withSql(async (sql) => {
      await seedEvalData(sql, now)
      const report = await runEval({ cases: cases.slice(0, 1), reps: 2, claude: fakeClaude([new Anthropic.InternalServerError(500, undefined, "boom", new Headers()), ...ORACLE["find-portland-5mi"]]).claude, model: "m", effort: "low", db: getDb(), sql, geocoder: new FakeGeocoder(), now })
      expect(report.errors).toMatchObject([{ id: "find-portland-5mi", rep: 1, kind: "api" }])
      expect(report.rows).toMatchObject([{ rep: 2, pass: true }])
    })
  })
})
