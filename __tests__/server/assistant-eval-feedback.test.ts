// @vitest-environment node
import { describe, expect, it } from "vitest"
import { parse } from "yaml"
import { caseFromFeedback } from "../../evals/assistant/fromFeedback"

describe("caseFromFeedback", () => {
  it("makes a case skeleton from a thumbs-down turn, with the context as comments", () => {
    const yaml = caseFromFeedback({ turnId: "0b1e2c3d-aaaa-4bbb-8ccc-123456789abc", question: "machines near Boise?", answer: "Try the Safeway.", reason: "wrong_place", comment: "That one closed", tools: [{ name: "find_places", input: { near: "Boise" }, ok: true }] })
    expect(yaml).toContain('# From thumbs-down turn 0b1e2c3d-aaaa-4bbb-8ccc-123456789abc: wrong_place, "That one closed".')
    expect(parse(yaml)).toEqual([{ id: "feedback-0b1e2c3d", category: "feedback", question: "machines near Boise?", expect: { tools: [], mentions: [], notMentions: [] } }])
  })

  it("needs the turn's text", () => {
    expect(() => caseFromFeedback({ turnId: "t", question: null, answer: null, reason: null, comment: null, tools: [] })).toThrow("no text")
  })
})
