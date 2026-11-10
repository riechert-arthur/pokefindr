import { describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { locations } from "@/server/db/schema"
import { RouterError, type RoutePoint, type RouteResult, type Router } from "@/server/ports/router"
import { FakeRouter } from "@/server/adapters/router/fake"
import { resetServerConfigForTests } from "@/server/config"

// Buckets in Postgres, emptied before each test with the other tables.
process.env.RATE_LIMIT_STORE = "postgres"

/** The router the route service gets: a stand-in for OpenRouteService, swapped per test. */
const provider = vi.hoisted(() => ({ current: null as Router | null }))
vi.mock("@/server/container", async (original) => ({
  ...(await original<typeof import("@/server/container")>()),
  getRouter: () => provider.current!,
}))

import { GET } from "@/app/api/route/route"
import { MAX_STOPS } from "@/server/services/street-routes"

/** Follows the roads: a bend between each pair of stops. */
const roads = (): Router & { calls: RoutePoint[][] } => {
  const calls: RoutePoint[][] = []
  return {
    calls,
    async route(stops) {
      calls.push([...stops])
      const coordinates = stops.flatMap(([lng, lat], i) => (i === 0 ? [[lng, lat]] : [[lng - 0.01, lat], [lng, lat]])) as [number, number][]
      const legs = stops.slice(1).map(() => ({ miles: 2.5, minutes: 6 }))
      return { routed: true, line: { type: "LineString", coordinates }, legs, miles: 2.5 * legs.length, minutes: 6 * legs.length } satisfies RouteResult
    },
  }
}

let ip = 0
const get = (ids: string[] | string, from = `198.51.100.${++ip % 250}`) =>
  GET(new NextRequest(`http://localhost/api/route?ids=${Array.isArray(ids) ? ids.join(",") : ids}`, { headers: { "x-forwarded-for": from } }))

async function seed() {
  return getDb()
    .insert(locations)
    .values([
      { machineId: "R1", retailer: "King Soopers", address: "1 Main St", city: "Denver", state: "CO", geog: { lng: -105, lat: 39.7 } },
      { machineId: "R2", retailer: "Target", address: "2 Main St", city: "Denver", state: "CO", geog: { lng: -105.05, lat: 39.75 }, canary: true, source: "canary" },
      { machineId: "R3", retailer: "Walmart", address: "3 Main St", city: "Denver", state: "CO", geog: { lng: -104.95, lat: 39.65 } },
      { machineId: "OFF", retailer: "Gone", geog: { lng: -105.1, lat: 39.8 }, isActive: false },
    ])
    .returning()
}

const UNKNOWN = "00000000-0000-4000-8000-000000000000"

describe("GET /api/route (#288)", () => {
  it("routes through the stops in the order given, in an explicit public shape, cached at the CDN", async () => {
    const router = roads()
    provider.current = router
    const [a, b, c] = await seed()
    const res = await get([c.id, a.id, b.id])
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("public, s-maxage=86400, stale-while-revalidate=604800")
    const body = await res.json()
    expect(Object.keys(body).sort()).toEqual(["legs", "line", "miles", "minutes", "routed", "stops"])
    expect(body).toMatchObject({ routed: true, miles: 5, minutes: 12, legs: [{ miles: 2.5, minutes: 6 }, { miles: 2.5, minutes: 6 }] })
    expect(body.stops).toEqual([
      { id: c.id, retailer: "Walmart", lng: -104.95, lat: 39.65 },
      { id: a.id, retailer: "King Soopers", lng: -105, lat: 39.7 },
      // A canary is returned like any other place, and nothing tells it apart.
      { id: b.id, retailer: "Target", lng: -105.05, lat: 39.75 },
    ])
    expect(JSON.stringify(body)).not.toMatch(/canary|machineID|address|source/i)
    // The coordinates come from the database, never the client.
    expect(router.calls).toEqual([
      [
        [-104.95, 39.65],
        [-105, 39.7],
        [-105.05, 39.75],
      ],
    ])
  })

  it(`takes 2 to ${MAX_STOPS} place ids, and skips the ones that aren't active places`, async () => {
    provider.current = roads()
    const [a, b, , off] = await seed()
    expect((await get([a.id])).status).toBe(400)
    expect((await get("")).status).toBe(400)
    expect((await get([a.id, "-105,39.7"])).status).toBe(400)
    expect((await get(Array.from({ length: MAX_STOPS + 1 }, () => a.id))).status).toBe(400)
    expect((await get([a.id, UNKNOWN])).status).toBe(404)
    expect((await get([UNKNOWN, off.id])).status).toBe(404)
    const skipped = await (await get([a.id, off.id, UNKNOWN, b.id])).json()
    expect(skipped.stops.map((s: { id: string }) => s.id)).toEqual([a.id, b.id])
    expect(skipped.legs).toHaveLength(1)
  })

  it("draws straight lines, briefly cached, when the router fails or isn't set up", async () => {
    const [a, b] = await seed()
    vi.spyOn(console, "error").mockImplementation(() => {})
    provider.current = { route: async () => Promise.reject(new RouterError("OpenRouteService routing failed with status 503", 503)) }
    const failed = await get([a.id, b.id])
    expect(failed.status).toBe(200)
    expect(failed.headers.get("Cache-Control")).toBe("public, s-maxage=300")
    const body = await failed.json()
    expect(body).toMatchObject({ routed: false, minutes: null, line: { type: "LineString", coordinates: [[-105, 39.7], [-105.05, 39.75]] } })
    expect(body.legs[0].miles).toBeGreaterThan(4)
    expect(body.legs[0].minutes).toBeNull()

    provider.current = new FakeRouter()
    expect(await (await get([a.id, b.id])).json()).toMatchObject({ routed: false })
  })

  it("draws straight lines when the router takes over 4 seconds", { timeout: 10_000 }, async () => {
    const [a, b] = await seed()
    vi.spyOn(console, "error").mockImplementation(() => {})
    provider.current = {
      route: (_stops, opts) =>
        new Promise((_, reject) => opts?.signal?.addEventListener("abort", () => reject(opts.signal!.reason))),
    }
    const started = Date.now()
    const body = await (await get([a.id, b.id])).json()
    expect(body.routed).toBe(false)
    expect(Date.now() - started).toBeGreaterThanOrEqual(3900)
  })

  it("limits each client to 10 at once", async () => {
    provider.current = roads()
    const [a, b] = await seed()
    const statuses = []
    for (let i = 0; i < 10; i++) statuses.push((await get([a.id, b.id], "203.0.113.50")).status)
    expect(statuses.every((s) => s === 200)).toBe(true)
    const limited = await get([a.id, b.id], "203.0.113.50")
    expect(limited.status).toBe(429)
    expect(Number(limited.headers.get("Retry-After"))).toBeGreaterThan(0)
    expect((await get([a.id, b.id], "203.0.113.51")).status).toBe(200)
  })

  // Last: the server's daily bucket stays refused in this instance's memory once it runs dry.
  it("stops asking the router past the daily cap, and draws straight lines instead", async () => {
    process.env.ROUTER_DAILY_CAP = "6"
    resetServerConfigForTests()
    const router = roads()
    provider.current = router
    const [a, b] = await seed()
    vi.spyOn(console, "warn").mockImplementation(() => {})
    const routed = []
    for (let i = 0; i < 5; i++) routed.push((await (await get([a.id, b.id])).json()).routed)
    // Half the cap at once, refilling half a day: never more than the cap in 24 hours.
    expect(routed).toEqual([true, true, true, false, false])
    expect(router.calls).toHaveLength(3)
    delete process.env.ROUTER_DAILY_CAP
    resetServerConfigForTests()
  })
})
