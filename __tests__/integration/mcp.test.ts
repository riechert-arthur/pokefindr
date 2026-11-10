import { beforeEach, describe, expect, it, vi } from "vitest"
import { Client, InMemoryTransport, StreamableHTTPClientTransport } from "@modelcontextprotocol/client"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { createReadOnlyServer } from "@/server/mcp/server"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { DELETE, GET, OPTIONS, POST } from "@/app/api/mcp/route"
import { MCP_PLACES_PER_DAY, MCP_REQUESTS_PER_MINUTE, resetMcpLimitsForTests } from "@/server/mcp/limits"

const ENDPOINT = "http://localhost:3000/api/mcp"
const APP_URL = process.env.APP_URL!

/** The SDK's own client, sending its requests straight to the route handler, from `ip`. */
async function connect({ modern = false, ip = "203.0.113.7" } = {}) {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT), {
    fetch: (url, init) => {
      const headers = new Headers(init?.headers)
      headers.set("x-forwarded-for", ip)
      return POST(new Request(url, { ...init, headers }))
    },
  })
  const client = new Client({ name: "pokefindr-test", version: "1.0.0" }, modern ? { versionNegotiation: { mode: "auto" } } : {})
  await client.connect(transport)
  return client
}

type Place = { id: string; name: string; url: string }

const textOf = (r: { content: unknown }) => (r.content as { type: string; text: string }[])[0].text

let pike: string

beforeEach(async () => {
  resetMcpLimitsForTests()
  const rows = await getDb()
    .insert(locations)
    .values([
      { machineId: "S1", retailer: "Safeway", address: "1 Pike St", city: "Seattle", state: "WA", geog: { lng: -122.34, lat: 47.61 } },
      { machineId: "Q1", retailer: "QFC", address: "2 Broadway", city: "Seattle", state: "WA", geog: { lng: -122.32, lat: 47.62 } },
      { kind: "shop", name: "Card Kingdom", address: "5105 Leary Ave", city: "Seattle", state: "WA", geog: { lng: -122.38, lat: 47.66 } },
    ])
    .returning({ id: locations.id, machineId: locations.machineId })
  pike = rows.find((r) => r.machineId === "S1")!.id
})

describe("/api/mcp", () => {
  it.each([
    ["a 2025 client", false],
    ["a 2026-07-28 client", true],
  ])("lists the read-only tools and runs find_places for %s", async (_name, modern) => {
    const client = await connect({ modern })
    expect(client.getProtocolEra()).toBe(modern ? "modern" : "legacy")
    expect(client.getServerVersion()).toMatchObject({ name: "pokefindr" })
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name).sort()).toEqual(["area_stats", "find_places", "get_place", "list_events", "plan_route"])
    const find = tools.find((t) => t.name === "find_places")!
    expect(find.annotations).toMatchObject({ readOnlyHint: true })
    expect(find.inputSchema).toMatchObject({ type: "object", required: ["near"] })
    // Cards are the in-app assistant's; MCP clients get the data.
    expect(find.description).not.toContain("card")

    const r = await client.callTool({ name: "find_places", arguments: { near: "Seattle, WA", radius_miles: 10 } })
    expect(r.isError).toBeFalsy()
    const data = r.structuredContent as { total: number; places: Place[] }
    expect(data.total).toBe(3)
    expect(data.places[0]).toMatchObject({ name: "Safeway", url: `${APP_URL}/map?location=${pike}` })
    expect(JSON.parse(textOf(r))).toEqual(data)
    await client.close()
  })

  it("links stops and events back to the map", async () => {
    const client = await connect()
    const found = (await client.callTool({ name: "find_places", arguments: { near: "Seattle, WA" } })).structuredContent as { places: Place[] }
    const route = await client.callTool({ name: "plan_route", arguments: { place_ids: found.places.map((p) => p.id) } })
    const stops = (route.structuredContent as { stops: Place[]; maps_url: string }).stops
    expect(stops.every((s) => s.url === `${APP_URL}/map?location=${s.id}`)).toBe(true)
    const one = await client.callTool({ name: "get_place", arguments: { id: pike } })
    expect(one.structuredContent).toMatchObject({ id: pike, url: `${APP_URL}/map?location=${pike}` })
    await client.close()
  })

  it("answers a bad input or an unknown place as a tool error the model can fix", async () => {
    const client = await connect()
    const bad = await client.callTool({ name: "find_places", arguments: { near: "Seattle, WA", limit: 50 } })
    expect(bad.isError).toBe(true)
    const unknown = await client.callTool({ name: "get_place", arguments: { id: "nope" } })
    expect(unknown).toMatchObject({ isError: true })
    expect(textOf(unknown)).toContain('No place has id "nope"')
    // There's no viewer location over MCP.
    expect(textOf(await client.callTool({ name: "find_places", arguments: { near: "me" } }))).toContain("shared a location")
    await client.close()
  })

  it(`limits each client to ${MCP_REQUESTS_PER_MINUTE} requests a minute, with a 429 and Retry-After`, async () => {
    const send = (ip: string) =>
      POST(new Request(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": ip }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) }))
    const statuses = await Promise.all(Array.from({ length: MCP_REQUESTS_PER_MINUTE + 2 }, () => send("198.51.100.1").then((r) => r.status)))
    expect(statuses.filter((s) => s === 429)).toHaveLength(2)
    const limited = await send("198.51.100.1")
    expect(limited.status).toBe(429)
    expect(limited.headers.get("retry-after")).toBe("60")
    expect(limited.headers.get("access-control-allow-origin")).toBe("*")
    expect(await limited.json()).toMatchObject({ jsonrpc: "2.0", error: { message: expect.stringContaining("Too many") } })
    // Another client isn't affected, and one IPv6 /64 is one client.
    expect((await send("198.51.100.2")).status).toBe(200)
  })

  it(`shows one client at most ${MCP_PLACES_PER_DAY} new places a day; ones already shown stay free`, async () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ machineId: `P${i}`, retailer: "Fred Meyer", city: "Portland", state: "OR", geog: { lng: -122.67 + i * 0.001, lat: 45.52 } }))
    await getDb().insert(locations).values(many)
    const { placeBudgetFor } = await import("@/server/mcp/limits")
    // Leave room for 3 more today.
    const budget = placeBudgetFor("ip:203.0.113.9", new Date())
    budget.left = 3
    const client = await connect({ ip: "203.0.113.9" })
    const first = await client.callTool({ name: "find_places", arguments: { near: "Portland, OR", limit: 10 } })
    expect((first.structuredContent as { places: Place[] }).places).toHaveLength(3)
    const again = await client.callTool({ name: "find_places", arguments: { near: "Portland, OR", limit: 10 } })
    expect((again.structuredContent as { places: Place[] }).places).toHaveLength(3)
    const elsewhere = await client.callTool({ name: "find_places", arguments: { near: "Seattle, WA" } })
    expect(elsewhere.isError).toBe(true)
    expect(textOf(elsewhere)).toContain("limit")
    // Someone else still can.
    const other = await connect({ ip: "203.0.113.10" })
    expect((await other.callTool({ name: "find_places", arguments: { near: "Seattle, WA" } })).isError).toBeFalsy()
    await Promise.all([client.close(), other.close()])
  })

  it("counts each message in a batch against the rate limit", async () => {
    const ping = (id: number) => ({ jsonrpc: "2.0", id, method: "ping" })
    const batch = (n: number, ip: string) =>
      POST(new Request(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-forwarded-for": ip }, body: JSON.stringify(Array.from({ length: n }, (_, i) => ping(i))) }))
    expect((await batch(MCP_REQUESTS_PER_MINUTE + 1, "198.51.100.3")).status).toBe(429)
    expect((await batch(MCP_REQUESTS_PER_MINUTE, "198.51.100.4")).status).not.toBe(429)
    expect((await batch(1, "198.51.100.4")).status).toBe(429)
  })

  it("passes the client's abort signal on to the handler", async () => {
    const ctl = new AbortController()
    const seen: AbortSignal[] = []
    const { mcpEndpoint, serveMcp } = await import("@/server/mcp/http")
    const handler = { ...mcpEndpoint(() => createReadOnlyServer({ appUrl: APP_URL, ctx: () => ({ db: getDb(), geocoder: new FakeGeocoder(), viewer: null, now: new Date() }) })) }
    handler.fetch = async (req: Request) => {
      seen.push(req.signal)
      return new Response(null, { status: 202 })
    }
    await serveMcp(handler, new Request(ENDPOINT, { method: "POST", body: "{}", signal: ctl.signal }), "ip:203.0.113.50")
    ctl.abort()
    expect(seen[0].aborted).toBe(true)
  })

  it("answers a failure the model can't fix with a generic error, and logs the real one", async () => {
    const broken = new FakeGeocoder()
    broken.search = async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password authentication failed")
    }
    const server = createReadOnlyServer({ appUrl: APP_URL, ctx: () => ({ db: getDb(), geocoder: broken, viewer: null, now: new Date() }) })
    const [a, b] = InMemoryTransport.createLinkedPair()
    await server.connect(b)
    const client = new Client({ name: "pokefindr-test", version: "1.0.0" })
    await client.connect(a)
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    const r = await client.callTool({ name: "find_places", arguments: { near: "Seattle, WA" } })
    expect(r.isError).toBe(true)
    expect(textOf(r)).not.toContain("ECONNREFUSED")
    expect(textOf(r)).toContain("Try again")
    const line = JSON.parse(String(logged.mock.calls.find((c) => String(c[0]).includes("mcp.tool_failed"))?.[0]))
    expect(line).toMatchObject({ level: "error", event: "mcp.tool_failed", tool: "find_places", errorName: "Error" })
    logged.mockRestore()
    await client.close()
  })

  it("answers CORS preflights, refuses session streams, and caps the body", async () => {
    const pre = await OPTIONS()
    expect(pre.status).toBe(204)
    // Any header (2026-07-28 clients send Mcp-Method, Mcp-Name, Mcp-Param-*), and Authorization by name.
    expect(pre.headers.get("access-control-allow-headers")).toBe("*, Authorization")
    expect((await GET(new Request(ENDPOINT, { headers: { accept: "text/event-stream" } }))).status).toBe(405)
    expect((await DELETE(new Request(ENDPOINT, { method: "DELETE" }))).status).toBe(405)
    const huge = await POST(
      new Request(ENDPOINT, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping", params: { pad: "x".repeat(70_000) } }) }),
    )
    expect(huge.status).toBe(413)
  })
})
