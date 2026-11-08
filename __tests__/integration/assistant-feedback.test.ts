import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { assistantFeedback, profiles } from "@/server/db/schema"
import { recordTurn, deleteHistory, purgeAssistantData } from "@/server/assistant/log"
import { downvotedTurns, feedbackStats } from "@/server/assistant/feedback"
import { POST } from "@/app/api/assistant/feedback/route"

const ME = "00000000-0000-4000-8000-000000000001"
const OTHER = "00000000-0000-4000-8000-000000000002"
const T1 = "00000000-0000-4000-8000-0000000000b1"
const T2 = "00000000-0000-4000-8000-0000000000b2"
const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0 }

const vote = (body: unknown, userId = ME) =>
  POST(new NextRequest("http://localhost/api/assistant/feedback", { method: "POST", body: JSON.stringify(body), headers: { "x-user-id": userId } }))

beforeEach(async () => {
  vi.spyOn(console, "info").mockImplementation(() => {})
  await getDb().insert(profiles).values([
    { id: ME, username: "ash" },
    { id: OTHER, username: "misty" },
  ])
  for (const [id, q] of [[T1, "machines near Denver"], [T2, "route in Seattle"]])
    await recordTurn({ id, userId: ME, outcome: "answered", model: "claude-opus-5-5", promptVersion: "abc123", usage, latencyMs: 1, tools: [{ name: "find_places", input: { near: "Denver" }, ok: true }], flags: [], text: { question: q, answer: "Here you go." } }, getDb())
})

describe("assistant feedback", () => {
  it("stores one vote per answer, changeable, only on the viewer's own answers", async () => {
    expect((await vote({ turnId: T1, vote: "down", reason: "wrong_place", comment: "  That Safeway closed  " })).status).toBe(200)
    expect(await getDb().select().from(assistantFeedback)).toMatchObject([{ turnId: T1, vote: -1, reason: "wrong_place", comment: "That Safeway closed" }])
    expect((await vote({ turnId: T1, vote: "up", reason: "outdated" })).status).toBe(200)
    expect(await getDb().select().from(assistantFeedback)).toMatchObject([{ turnId: T1, vote: 1, reason: null, comment: null }])

    expect((await vote({ turnId: T1, vote: "up" }, OTHER)).status).toBe(404)
    expect((await vote({ turnId: T1, vote: "sideways" })).status).toBe(400)
    expect((await vote({ turnId: T1, vote: "down", reason: "rude" })).status).toBe(400)
  })

  it("counts only turns that showed the buttons", async () => {
    await recordTurn({ id: "00000000-0000-4000-8000-0000000000b3", userId: ME, outcome: "error", model: "claude-opus-5-5", promptVersion: "abc123", usage, latencyMs: 1, tools: [], flags: [], text: null }, getDb())
    await recordTurn({ id: "00000000-0000-4000-8000-0000000000b4", userId: ME, outcome: "limited", model: null, usage, latencyMs: null, tools: [], flags: [], text: null }, getDb())
    const stats = await feedbackStats(new Date(Date.now() - 86_400_000), getDb())
    expect(stats).toEqual([expect.objectContaining({ model: "claude-opus-5-5", answered: 2 })])
  })

  it("reports rates per day, model and prompt, and lists thumbs-down answers with their text", async () => {
    await vote({ turnId: T1, vote: "down", reason: "outdated", comment: "Gone since June" })
    await vote({ turnId: T2, vote: "up" })
    const since = new Date(Date.now() - 86_400_000)
    expect(await feedbackStats(since, getDb())).toEqual([{ day: new Date().toISOString().slice(0, 10), model: "claude-opus-5-5", promptVersion: "abc123", answered: 2, up: 1, down: 1 }])
    expect(await downvotedTurns(since, getDb())).toMatchObject([{ turnId: T1, reason: "outdated", comment: "Gone since June", question: "machines near Denver", answer: "Here you go.", promptVersion: "abc123", tools: [{ name: "find_places", input: { near: "Denver" }, ok: true }] }])
  })

  it("clears comments with the history, and after 30 days", async () => {
    await vote({ turnId: T1, vote: "down", comment: "Gone" })
    await deleteHistory(ME, getDb())
    expect(await getDb().select({ comment: assistantFeedback.comment, vote: assistantFeedback.vote }).from(assistantFeedback)).toEqual([{ comment: null, vote: -1 }])

    await vote({ turnId: T2, vote: "down", comment: "Wrong" })
    const later = new Date(Date.now() + 31 * 86_400_000)
    expect(await purgeAssistantData(later, getDb())).toMatchObject({ feedbackComments: 1 })
  })
})
