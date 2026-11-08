import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { getDb } from "@/server/db/client"
import { assistantPlaceViews, assistantUsage, locations, profiles } from "@/server/db/schema"
import { resetServerConfigForTests } from "@/server/config"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { setClaudeForTests } from "@/server/assistant/run"
import { runTool } from "@/server/assistant/tools"
import { MESSAGES_PER_DAY, MESSAGES_PER_MINUTE, TOKENS_PER_DAY, endTurn, resetLimitsForTests, startTurn, utcDay, type PlaceBudget } from "@/server/assistant/limits"
import { POST } from "@/app/api/assistant/route"
import { fakeClaude } from "./fakeClaude"

const ME = "00000000-0000-4000-8000-000000000001"
const OTHER = "00000000-0000-4000-8000-000000000002"
const today = () => utcDay(new Date())

const post = () =>
  POST(new NextRequest("http://localhost/api/assistant", { method: "POST", body: JSON.stringify({ messages: [{ role: "user", content: "hi" }] }), headers: { "x-user-id": ME } }))

beforeEach(async () => {
  resetLimitsForTests()
  await getDb().insert(profiles).values([
    { id: ME, username: "ash" },
    { id: OTHER, username: "misty" },
  ])
  setClaudeForTests(fakeClaude(Array.from({ length: 20 }, () => ({ text: "Hello." }))).claude)
})

afterEach(() => {
  setClaudeForTests(null)
  delete process.env.ASSISTANT_ENABLED
  delete process.env.ASSISTANT_DAILY_BUDGET_USD
  resetServerConfigForTests()
})

describe("assistant limits", () => {
  it("counts each message and what it used", async () => {
    await (await post()).text()
    const [row] = await getDb().select().from(assistantUsage).where(eq(assistantUsage.userId, ME))
    // The fake answers each call with 100 input, 50 cache-read, 10 cache-write and 20 output tokens.
    expect(row).toMatchObject({ day: today(), messages: 1, inputTokens: 160, outputTokens: 20, costMicros: 860 })
  })

  it("stops a viewer past the daily messages or tokens, until midnight UTC", async () => {
    await getDb().insert(assistantUsage).values({ userId: ME, day: today(), messages: MESSAGES_PER_DAY })
    const res = await post()
    expect(res.status).toBe(429)
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0)
    expect((await res.json()).error).toContain(`${MESSAGES_PER_DAY} messages`)

    await getDb().update(assistantUsage).set({ messages: 1, inputTokens: TOKENS_PER_DAY })
    const tokens = await post()
    expect(tokens.status).toBe(429)
    expect((await tokens.json()).error).toContain("allowance")
  })

  it("pauses for everyone once today's spend passes the ceiling, and on the kill switch", async () => {
    process.env.ASSISTANT_DAILY_BUDGET_USD = "1"
    resetServerConfigForTests()
    await getDb().insert(assistantUsage).values({ userId: OTHER, day: today(), messages: 3, costMicros: 1_000_000 })
    const res = await post()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ paused: true, error: expect.stringContaining("paused for today") })

    process.env.ASSISTANT_DAILY_BUDGET_USD = "100"
    process.env.ASSISTANT_ENABLED = "false"
    resetServerConfigForTests()
    expect((await post()).status).toBe(503)
  })

  it("limits messages a minute, and one open turn at a time", async () => {
    const statuses = []
    for (let i = 0; i <= MESSAGES_PER_MINUTE; i++) {
      const res = await post()
      statuses.push(res.status)
      await res.text()
    }
    expect(statuses.slice(0, MESSAGES_PER_MINUTE).every((s) => s === 200)).toBe(true)
    expect(statuses.at(-1)).toBe(429)

    resetLimitsForTests()
    const now = new Date()
    expect(await startTurn({ userId: OTHER, now, dailyBudgetMicros: 1e9 }, getDb())).toMatchObject({ ok: true })
    expect(await startTurn({ userId: OTHER, now, dailyBudgetMicros: 1e9 }, getDb())).toMatchObject({ ok: false, refusal: { message: expect.stringContaining("current answer") } })
    await endTurn({ userId: OTHER, now, usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0 } }, getDb())
    expect(await startTurn({ userId: OTHER, now, dailyBudgetMicros: 1e9 }, getDb())).toMatchObject({ ok: true })
  })
})

describe("the daily cap on places", () => {
  it("shows places already seen for free, new ones until the budget runs out, then points to the map", async () => {
    const rows = await getDb()
      .insert(locations)
      .values([0, 1, 2].map((i) => ({ machineId: `S${i}`, retailer: `Store ${i}`, city: "Seattle", state: "WA", geog: { lng: -122.33 + i * 0.001, lat: 47.6 } })))
      .returning({ id: locations.id })
    const ctx = (places: PlaceBudget) => ({ db: getDb(), geocoder: new FakeGeocoder(), viewer: null, now: new Date(), places })
    const budget: PlaceBudget = { left: 1, seen: new Set([rows[2].id]), added: [] }
    const r = await runTool("find_places", { near: "Seattle, WA" }, ctx(budget))
    expect(r.ok && (r.data.places as unknown[]).length).toBe(2)
    expect(budget).toMatchObject({ left: 0, added: [rows[0].id] })

    const none: PlaceBudget = { left: 0, seen: new Set(), added: [] }
    expect(await runTool("find_places", { near: "Seattle, WA" }, ctx(none))).toMatchObject({ ok: false, error: expect.stringContaining("map shows every place") })
  })

  it("records the places a turn showed", async () => {
    await getDb().insert(locations).values({ machineId: "S1", retailer: "Safeway", city: "Seattle", state: "WA", geog: { lng: -122.34, lat: 47.61 } })
    setClaudeForTests(fakeClaude([{ tools: [{ name: "find_places", input: { near: "Seattle, WA" } }] }, { text: "One." }]).claude)
    await (await post()).text()
    expect(await getDb().select().from(assistantPlaceViews)).toMatchObject([{ userId: ME, day: today() }])
  })
})
