// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { MODERATION_CATEGORIES } from "@/server/ports/moderator"
import { FakeModerator } from "@/server/adapters/moderator/fake"
import { gate, loadCases, runCases, summarize, type CaseResult } from "../../evals/moderation/runner"

describe("the moderation eval set", () => {
  const cases = loadCases()

  it("has about 60 reviews and 30 questions, with unique ids and known categories", () => {
    expect(cases.filter((c) => c.kind === "review").length).toBeGreaterThanOrEqual(60)
    expect(cases.filter((c) => c.kind === "question").length).toBeGreaterThanOrEqual(30)
    expect(new Set(cases.map((c) => c.id)).size).toBe(cases.length)
    for (const c of cases) {
      for (const cat of c.categories) expect(MODERATION_CATEGORIES).toContain(cat)
      // Flagged cases name a category; clean ones don't.
      expect(c.flag, c.id).toBe(c.categories.length > 0)
      if (c.group === "clean" || c.group === "slang") expect(c.flag, c.id).toBe(false)
      if (c.group === "abusive" || c.group === "injection") expect(c.flag, c.id).toBe(true)
    }
  })

  it("covers clean, slang, borderline, abusive and injection text", () => {
    expect(new Set(cases.map((c) => c.group))).toEqual(new Set(["clean", "slang", "borderline", "abusive", "injection"]))
  })

  it("runs end to end on the fake for free", async () => {
    const s = summarize(await runCases(new FakeModerator(), cases))
    expect(s.costMicros).toBe(0)
    expect(s.failedChecks).toBe(0)
    expect(s.cleanReviewsFlagged.of).toBe(30)
  })
})

describe("summarize", () => {
  const row = (over: Partial<CaseResult> & Pick<CaseResult, "group" | "expected">, verdict: "allow" | "hold" | "block", categories: string[] = [], failed?: boolean): CaseResult => ({
    id: Math.random().toString(36),
    kind: "review",
    got: { verdict, categories: categories as CaseResult["got"]["categories"], reason: "", failed },
    costMicros: 100,
    latencyMs: 10,
    ...over,
  })

  it("scores the targets, precision and recall, and adds up the cost", () => {
    const results = [
      row({ group: "clean", expected: { flag: false, categories: [] } }, "allow"),
      row({ group: "clean", expected: { flag: false, categories: [] } }, "hold", ["spam"]),
      row({ group: "abusive", expected: { flag: true, categories: ["threat"] } }, "block", ["threat"]),
      row({ group: "abusive", expected: { flag: true, categories: ["harassment"] } }, "hold", ["off_topic"]),
      // A failed check never counts as caught.
      row({ group: "injection", expected: { flag: true, categories: ["injection"] } }, "hold", [], true),
    ]
    const s = summarize(results)
    expect(s.cleanReviewsFlagged).toEqual({ n: 1, of: 2, rate: 0.5 })
    expect(s.abusiveCaught).toEqual({ n: 2, of: 3, rate: 2 / 3 })
    expect(s.flag).toEqual({ precision: 2 / 3, recall: 2 / 3 })
    expect(s.byCategory.threat).toEqual({ precision: 1, recall: 1, support: 1 })
    expect(s.byCategory.harassment).toEqual({ precision: 1, recall: 0, support: 1 })
    expect(s.byCategory.spam).toEqual({ precision: 0, recall: 1, support: 0 })
    expect(s.costMicros).toBe(500)
    expect(s.failedChecks).toBe(1)
    expect(gate(s)).toHaveLength(2)
  })
})
