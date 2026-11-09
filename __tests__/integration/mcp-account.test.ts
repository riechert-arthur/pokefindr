import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
const { enqueued } = vi.hoisted(() => ({ enqueued: [] as { job: string; payload: unknown }[] }))
vi.mock("@/server/lib/jobs/enqueue", () => ({
  enqueueJob: async (job: string, payload: unknown) => {
    enqueued.push({ job, payload })
    return { mode: "queued", messageId: null }
  },
}))

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { eq } from "drizzle-orm"
import { DELETE as accountDelete, POST as accountPost } from "@/app/api/mcp/account/route"
import { resetAuthForTests, revokeConnectedApps } from "@/server/auth/auth"
import { getDb } from "@/server/db/client"
import { assistantPlaceViews, jwks, oauthClients, locationRatings, locations, profiles } from "@/server/db/schema"
import { PLACES_PER_DAY, utcDay } from "@/server/assistant/limits"
import { listMySubmissions } from "@/server/services/submissions"
import { resetMcpLimitsForTests } from "@/server/mcp/limits"
import { BASE, accessToken, identity, signIn } from "./oauthFlow"

const ENDPOINT = `${BASE}/api/mcp/account`
const DC = { address: "1600 Pennsylvania Ave NW", city: "Washington", state: "DC" }

// requireMcpAuth reads the signing keys from /api/identity/jwks over HTTP: answer it from the handler.
const realFetch = globalThis.fetch
beforeAll(() => {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url
    if (url.startsWith(`${BASE}/api/identity/jwks`)) return identity("/jwks", { headers: init?.headers })
    return realFetch(input, init)
  })
})
afterAll(() => vi.restoreAllMocks())

// Tests empty every table, signing keys included; keys are cached per process, so keep the first one.
let keys: (typeof jwks.$inferSelect)[] = []
beforeEach(async () => {
  resetAuthForTests()
  resetMcpLimitsForTests()
  enqueued.length = 0
  if (keys.length) await getDb().insert(jwks).values(keys)
})
const keepKeys = async () => {
  if (!keys.length) keys = await getDb().select().from(jwks)
}

async function connect(bearer: string) {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    fetch: (url, init) => {
      const headers = new Headers(init?.headers)
      headers.set("authorization", `Bearer ${bearer}`)
      return accountPost(new Request(url, { ...init, headers }))
    },
  })
  const client = new Client({ name: "pokefindr-test", version: "1.0.0" })
  await client.connect(transport)
  return client
}

const rpc = (body: unknown, bearer?: string) =>
  accountPost(
    new Request(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-06-18", ...(bearer ? { authorization: `Bearer ${bearer}` } : {}) },
      body: JSON.stringify(body),
    }),
  )
const textOf = (r: { content: unknown }) => (r.content as { text: string }[])[0].text
const shop = (over: Record<string, unknown> = {}) => ({ type: "shop", name: "Capital Cards", ...DC, website: "https://capitalcards.example", sells: ["singles"], ...over })

describe("/api/mcp/account", () => {
  it("answers no token with a 401 that points clients at the sign-in metadata", async () => {
    const res = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" })
    expect(res.status).toBe(401)
    expect(res.headers.get("access-control-allow-origin")).toBe("*")
    const challenge = res.headers.get("www-authenticate")!
    expect(challenge).toMatch(/^Bearer /)
    expect(challenge).toContain(`resource_metadata="${BASE}/.well-known/oauth-protected-resource/api/mcp/account"`)
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, "not-a-token")).status).toBe(401)
  })

  it("lets a signed-in client submit a place, which is pending and shows in my_submissions", async () => {
    const me = await signIn()
    const bearer = await accessToken({ signedIn: me })
    await keepKeys()
    const client = await connect(bearer)
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(["area_stats", "find_places", "get_place", "list_events", "my_reviews", "my_submissions", "plan_route", "submit_place"])
    expect(tools.find((t) => t.name === "submit_place")!.annotations).toMatchObject({ readOnlyHint: false })

    const sent = await client.callTool({ name: "submit_place", arguments: shop() })
    expect(sent.isError, textOf(sent)).toBeFalsy()
    const { id, status } = sent.structuredContent as { id: string; status: string }
    expect(status).toBe("pending")
    // The same as from the site's form: pending, the person's own, and moderators get told.
    expect(await listMySubmissions(me.userId)).toMatchObject([{ id, status: "pending", kind: "shop", name: "Capital Cards", city: "Washington", lng: -77.0365, lat: 38.8977 }])
    expect(enqueued).toEqual([{ job: "submission-created", payload: { submissionId: id } }])

    const mine = await client.callTool({ name: "my_submissions", arguments: {} })
    expect(mine.structuredContent).toMatchObject({ submissions: [{ id, type: "card shop", name: "Capital Cards", status: "pending" }] })
    await client.close()
  })

  it("asks before adding one near a place already on the map, then adds it once confirmed", async () => {
    const [near] = await getDb().insert(locations).values({ kind: "shop", name: "White House Games", city: "Washington", state: "DC", geog: { lng: -77.0366, lat: 38.8977 } }).returning()
    const client = await connect(await accessToken())
    await keepKeys()
    const first = await client.callTool({ name: "submit_place", arguments: shop() })
    expect(first.structuredContent).toMatchObject({ status: "not_submitted", nearby: [{ name: "White House Games", url: `${BASE}/map?location=${near.id}` }] })
    const confirmed = await client.callTool({ name: "submit_place", arguments: shop({ confirm_duplicate: true }) })
    expect(confirmed.structuredContent).toMatchObject({ status: "pending" })
    await client.close()
  })

  it("explains what to fix: an address it can't find, a past event, a bad link", async () => {
    const client = await connect(await accessToken())
    await keepKeys()
    const nowhere = await client.callTool({ name: "submit_place", arguments: shop({ address: "1 Nowhere Rd", city: "Atlantis" }) })
    expect(nowhere.isError).toBe(true)
    expect(textOf(nowhere)).toContain("street address")
    const past = await client.callTool({ name: "submit_place", arguments: { type: "event", name: "League night", ...DC, starts_at: "2020-01-01T18:00:00Z" } })
    expect(textOf(past)).toContain("starts_at: That date has passed.")
    const noStart = await client.callTool({ name: "submit_place", arguments: { type: "event", name: "League night", ...DC } })
    expect(textOf(noStart)).toContain("starts_at")
    const link = await client.callTool({ name: "submit_place", arguments: shop({ website: "javascript:alert(1)" }) })
    expect(textOf(link)).toContain("website")
    await client.close()
  })

  it("needs places:submit to submit: a token without it gets a 403 naming the scope", async () => {
    const bearer = await accessToken({ scope: "openid offline_access account:read" })
    await keepKeys()
    const client = await connect(bearer)
    expect((await client.callTool({ name: "my_submissions", arguments: {} })).isError).toBeFalsy()
    await client.close()
    const res = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "submit_place", arguments: shop() } }, bearer)
    expect(res.status).toBe(403)
    expect(res.headers.get("www-authenticate")).toMatch(/error="insufficient_scope".*scope="[^"]*places:submit/)
    expect(await getDb().select().from(locations)).toEqual([])
  })

  it("lists the person's own reviews", async () => {
    const me = await signIn()
    const [place] = await getDb().insert(locations).values({ machineId: "S1", retailer: "Safeway", city: "Seattle", state: "WA", geog: { lng: -122.34, lat: 47.61 } }).returning()
    await getDb().insert(locationRatings).values({ locationId: place.id, userId: me.userId, rating: 4, text: "Restocked on‮ Fridays" })
    const client = await connect(await accessToken({ signedIn: me }))
    await keepKeys()
    const r = await client.callTool({ name: "my_reviews", arguments: {} })
    expect(r.structuredContent).toMatchObject({ total: 1, reviews: [{ rating: 4, untrusted_text: "Restocked on Fridays", place: { id: place.id, name: "Safeway", url: `${BASE}/map?location=${place.id}` } }] })
    await client.close()
  })

  it("keeps the person's place count across 2025-era requests and calls sent at once", async () => {
    const me = await signIn()
    const rows = await getDb()
      .insert(locations)
      .values(Array.from({ length: 30 }, (_, i) => ({ machineId: `P${i}`, retailer: "Fred Meyer", city: "Portland", state: "OR", geog: { lng: -122.67 + i * 0.0005, lat: 45.52 } })))
      .returning({ id: locations.id })
    const others = await getDb()
      .insert(locations)
      .values(Array.from({ length: PLACES_PER_DAY - 5 }, (_, i) => ({ machineId: `X${i}`, retailer: "Elsewhere", city: "Miami", state: "FL", geog: { lng: -80.19, lat: 25.76 } })))
      .returning({ id: locations.id })
    // Already shown 195 places today: 5 are left.
    const day = utcDay(new Date())
    await getDb().insert(assistantPlaceViews).values(others.map((o) => ({ userId: me.userId, day, locationId: o.id })))
    const client = await connect(await accessToken({ signedIn: me }))
    await keepKeys()
    expect(client.getProtocolEra()).toBe("legacy")
    const calls = await Promise.all(Array.from({ length: 4 }, () => client.callTool({ name: "find_places", arguments: { near: "Portland, OR", limit: 10 } })))
    const shown = new Set(calls.flatMap((c) => ((c.structuredContent as { places?: { id: string }[] } | undefined)?.places ?? []).map((p) => p.id)))
    expect(shown.size).toBe(5)
    const saved = await getDb().select().from(assistantPlaceViews).where(eq(assistantPlaceViews.userId, me.userId))
    expect(saved).toHaveLength(PLACES_PER_DAY)
    expect(rows.filter((r) => shown.has(r.id))).toHaveLength(5)
    await client.close()
  })

  it("refuses a token at once when its app is disconnected (password reset) or disabled", async () => {
    const me = await signIn()
    const bearer = await accessToken({ signedIn: me })
    await keepKeys()
    const list = () => rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, bearer)
    expect((await list()).status).toBe(200)
    await getDb().update(oauthClients).set({ disabled: true })
    expect((await list()).status).toBe(401)
    await getDb().update(oauthClients).set({ disabled: null })
    expect((await list()).status).toBe(200)
    await revokeConnectedApps(me.userId)
    const res = await list()
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ error: { message: expect.stringContaining("no longer connected") } })
  })

  it("refuses a token whose account is gone", async () => {
    const me = await signIn()
    const bearer = await accessToken({ signedIn: me })
    await keepKeys()
    await getDb().delete(profiles).where(eq(profiles.id, me.userId))
    expect((await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list" }, bearer)).status).toBe(401)
  })

  it("refuses session streams", async () => {
    const bearer = await accessToken()
    await keepKeys()
    expect((await accountDelete(new Request(ENDPOINT, { method: "DELETE", headers: { authorization: `Bearer ${bearer}` } }))).status).toBe(405)
  })
})
