import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import Anthropic from "@anthropic-ai/sdk"
import type { BetaMessage, BetaToolResultBlockParam } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { fakeClaude } from "./fakeClaude"
import { getDb } from "@/server/db/client"
import { locations, profiles } from "@/server/db/schema"
import { resetLimitsForTests } from "@/server/assistant/limits"
import { MAX_ROUNDS, setClaudeForTests } from "@/server/assistant/run"
import { POST } from "@/app/api/assistant/route"
import type { AssistantEvent } from "@/lib/types/assistant-stream"

const USER = "00000000-0000-4000-8000-000000000001"

const post = (body: unknown, userId: string | null = USER) =>
  POST(new NextRequest("http://localhost/api/assistant", { method: "POST", body: JSON.stringify(body), headers: userId ? { "x-user-id": userId } : {} }))

async function events(res: Response): Promise<AssistantEvent[]> {
  const text = await res.text()
  return text.trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
}

const ask = (content: string) => ({ messages: [{ role: "user", content }] })

let safeway: string

beforeEach(async () => {
  resetLimitsForTests()
  await getDb().insert(profiles).values({ id: USER, username: "ash" })
  const [row] = await getDb()
    .insert(locations)
    .values([
      { machineId: "S1", retailer: "Safeway", address: "1 Pike St", city: "Seattle", state: "WA", geog: { lng: -122.34, lat: 47.61 } },
      { machineId: "Q1", retailer: "QFC", address: "2 Broadway", city: "Seattle", state: "WA", geog: { lng: -122.32, lat: 47.62 } },
    ])
    .returning({ id: locations.id })
  safeway = row.id
})

afterEach(() => {
  setClaudeForTests(null)
  vi.restoreAllMocks()
})

describe("POST /api/assistant", () => {
  it("runs the tools Claude asks for, streams text and cards, and ends with the memory and usage", async () => {
    const { claude, calls } = fakeClaude([
      { text: "Let me look.", tools: [{ name: "find_places", input: { near: "Seattle, WA" } }] },
      { text: "**Safeway** on Pike St is closest." },
    ])
    setClaudeForTests(claude)
    const res = await post(ask("machines in Seattle?"))
    expect(res.headers.get("content-type")).toContain("application/x-ndjson")
    const out = await events(res)

    expect(out.filter((e) => e.type === "status")).toEqual([{ type: "status", text: "Searching locations…" }])
    const card = out.find((e) => e.type === "card")
    expect(card).toMatchObject({ card: { type: "places", total: 2, places: [{ id: safeway, name: "Safeway" }, { name: "QFC" }] } })
    const text = out.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("")
    expect(text).toBe("Let me look.\n\n**Safeway** on Pike St is closest.")
    const done = out.at(-1) as Extract<AssistantEvent, { type: "done" }>
    expect(done).toMatchObject({ type: "done", stop: "end_turn", model: "claude-opus-5-5", usage: { inputTokens: 200, outputTokens: 40, cacheReadTokens: 100, cacheWriteTokens: 20, costMicros: 2 * (100 * 4 + 20 * 20 + 50 * 0.2 + 10 * 5) } })
    expect(done.memory).toContain(`Safeway, Seattle (id ${safeway})`)

    // What Claude was sent: a cached system prompt, the tools, the context after the question, then the tool result.
    expect(calls).toHaveLength(2)
    expect(calls[0]).toMatchObject({ model: "claude-opus-5-5", output_config: { effort: "medium" }, fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] })
    expect(calls[0].system).toMatchObject([{ cache_control: { type: "ephemeral" } }])
    expect(calls[0].tools!.map((t) => ("name" in t ? t.name : ""))).toEqual(["find_places", "area_stats", "plan_route", "list_events", "get_place"])
    expect(calls[0].messages.map((m) => m.role)).toEqual(["user", "system"])
    expect(calls[0].messages[1].content).toContain("hasn't shared a location")
    expect(calls[1].messages.map((m) => m.role)).toEqual(["user", "system", "assistant", "user"])
    const result = (calls[1].messages[3].content as BetaToolResultBlockParam[])[0]
    expect(result.is_error).toBeUndefined()
    expect(JSON.parse(result.content as string)).toMatchObject({ area: "Seattle, WA", total: 2 })
  })

  it("after a mid-answer fallback, runs and sends back only what the answering model wrote, and counts both attempts", async () => {
    const usage = (input: number, output: number) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, cache_creation: null })
    const { claude, calls } = fakeClaude([
      {
        message: {
          model: "claude-opus-4-8",
          stop_reason: "tool_use",
          content: [
            { type: "text", text: "Looking", citations: null },
            { type: "tool_use", id: "toolu_declined", name: "area_stats", input: { area: "WA" } },
            { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-opus-4-8" } },
            { type: "tool_use", id: "toolu_kept", name: "find_places", input: { near: "Seattle, WA" } },
          ] as unknown as BetaMessage["content"],
          usage: { ...usage(100, 30), iterations: [{ type: "message", model: "claude-opus-5-5", ...usage(100, 10) }, { type: "fallback_message", model: "claude-opus-4-8", ...usage(100, 30) }] } as unknown as BetaMessage["usage"],
        },
      },
      { text: "Safeway is closest." },
    ])
    setClaudeForTests(claude)
    const out = await events(await post(ask("near Seattle")))
    expect(out.filter((e) => e.type === "card").map((e) => (e as { card: { type: string } }).card.type)).toEqual(["places"])
    const sentBack = calls[1].messages[2].content as { type: string; id?: string }[]
    expect(sentBack.map((b) => b.id ?? b.type)).toEqual(["text", "toolu_kept"])
    expect((calls[1].messages[3].content as BetaToolResultBlockParam[]).map((r) => r.tool_use_id)).toEqual(["toolu_kept"])
    // Both attempts of the first call, plus the second call.
    // Each attempt priced by its own model: 600 (Opus 5.5) + 1,250 (Opus 4.8) + 860.
    expect(out.at(-1)).toMatchObject({ type: "done", model: "claude-opus-5-5", usage: { inputTokens: 300, outputTokens: 60, costMicros: 2710 } })
  })

  it("skips a blank answer in the history instead of failing", async () => {
    const { claude, calls } = fakeClaude([{ text: "Sure." }])
    setClaudeForTests(claude)
    const res = await post({ messages: [{ role: "user", content: "a" }, { role: "assistant", content: "  " }, { role: "user", content: "b" }] })
    expect(res.status).toBe(200)
    await events(res)
    expect(calls[0].messages.filter((m) => m.role !== "system").map((m) => m.content)).toEqual(["a", "b"])
  })

  it("sends bad tool input back as an error Claude can fix", async () => {
    const { claude, calls } = fakeClaude([{ tools: [{ name: "find_places", input: { near: "" } }] }, { text: "Which city?" }])
    setClaudeForTests(claude)
    const out = await events(await post(ask("near?")))
    expect(out.some((e) => e.type === "card")).toBe(false)
    expect((calls[1].messages[3].content as BetaToolResultBlockParam[])[0]).toMatchObject({ is_error: true })
    expect(out.at(-1)).toMatchObject({ type: "done", stop: "end_turn" })
  })

  it("rounds the viewer's location and lets 'me' work", async () => {
    const { claude, calls } = fakeClaude([{ tools: [{ name: "find_places", input: { near: "me", radius_miles: 5 } }] }, { text: "Two close by." }])
    setClaudeForTests(claude)
    const out = await events(await post({ ...ask("near me"), viewer: { lng: -122.33789, lat: 47.61234 } }))
    expect(out.find((e) => e.type === "card")).toMatchObject({ card: { near: { lng: -122.34, lat: 47.61, label: "you" } } })
    expect(calls[0].messages[1].content).toContain("has shared their location")
  })

  it("stops on a refusal, and after too many tool rounds", async () => {
    setClaudeForTests(fakeClaude([{ text: "Here is how to", stop: "refusal" }]).claude)
    const refused = await events(await post(ask("something else")))
    // The declined partial isn't remembered as an answer.
    expect(refused.at(-1)).toMatchObject({ type: "done", stop: "refusal", memory: expect.stringMatching(/^I can't help/) })

    const loop = Array.from({ length: MAX_ROUNDS + 2 }, () => ({ tools: [{ name: "area_stats", input: { area: "WA" } }] }))
    const { claude, calls } = fakeClaude(loop)
    setClaudeForTests(claude)
    const out = await events(await post(ask("count forever")))
    expect(calls).toHaveLength(MAX_ROUNDS)
    expect(out.at(-1)).toMatchObject({ type: "done", stop: "tool_limit" })
  })

  it("keeps the last turns of history, starting with the viewer's", async () => {
    const { claude, calls } = fakeClaude([{ text: "Sure." }])
    setClaudeForTests(claude)
    const messages = Array.from({ length: 25 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }))
    await events(await post({ messages }))
    const sent = calls[0].messages.filter((m) => m.role !== "system")
    expect(sent[0]).toEqual({ role: "user", content: "m6" })
    expect(sent.at(-1)).toEqual({ role: "user", content: "m24" })
  })

  it("turns an API failure into a short error event", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    setClaudeForTests(fakeClaude([new Anthropic.RateLimitError(429, undefined, "rate limited", new Headers())]).claude)
    const out = await events(await post(ask("hi")))
    expect(out).toEqual([{ type: "error", message: "The assistant is busy right now. Try again in a minute." }])
  })

  it("needs a session, a configured key and a valid body", async () => {
    expect((await post(ask("hi"), null)).status).toBe(401)
    expect((await post(ask("hi"))).status).toBe(503)
    setClaudeForTests(fakeClaude([]).claude)
    expect((await post({ messages: [{ role: "assistant", content: "hi" }] })).status).toBe(400)
    expect((await post({ messages: [{ role: "user", content: "x".repeat(2001) }] })).status).toBe(400)
  })
})
