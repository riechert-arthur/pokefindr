import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { getDb } from "@/server/db/client"
import { highlights, locationRatings, locations, profiles } from "@/server/db/schema"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { ASSISTANT_TOOLS, MAX_PLACES, inputJsonSchema, runTool, type ToolContext } from "@/server/assistant/tools"

const now = new Date("2026-11-07T12:00:00Z")
const ctx = (viewer: ToolContext["viewer"] = null): ToolContext => ({ db: getDb(), geocoder: new FakeGeocoder(), viewer, now })

let pike: string
let qfc: string

beforeEach(async () => {
  const db = getDb()
  const rows = await db
    .insert(locations)
    .values([
      { machineId: "S1", retailer: "Safeway", address: "1 Pike St", city: "Seattle", state: "WA", geog: { lng: -122.34, lat: 47.61 } },
      { machineId: "Q1", retailer: "QFC", address: "2 Broadway", city: "Seattle", state: "WA", geog: { lng: -122.32, lat: 47.62 } },
      { machineId: "S2", retailer: "Safeway", address: "3 Main St", city: "Tacoma", state: "WA", geog: { lng: -122.44, lat: 47.25 } },
      { kind: "shop", name: "Card Kingdom", address: "5105 Leary Ave", city: "Seattle", state: "WA", geog: { lng: -122.38, lat: 47.66 } },
      { kind: "event", name: "League night (sample)", city: "Seattle", state: "WA", geog: { lng: -122.33, lat: 47.6 }, source: "sample" },
      { machineId: "D1", retailer: "King Soopers", city: "Denver", state: "CO", geog: { lng: -104.99, lat: 39.74 } },
      ...Array.from({ length: 14 }, (_, i) => ({ machineId: `P${i}`, retailer: "Fred Meyer", city: "Portland", state: "OR", geog: { lng: -122.67 + i * 0.001, lat: 45.52 } })),
    ])
    .returning({ id: locations.id, machineId: locations.machineId })
  pike = rows.find((r) => r.machineId === "S1")!.id
  qfc = rows.find((r) => r.machineId === "Q1")!.id
})

describe("find_places", () => {
  it("finds the closest places near a city, with miles, and marks sample data", async () => {
    const r = await runTool("find_places", { near: "Seattle, WA", radius_miles: 10 }, ctx())
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.data.total).toBe(4)
    const places = r.data.places as { name: string; type: string; miles: number; sample_data?: true }[]
    expect(places.map((p) => p.name)).toEqual(["League night (sample)", "Safeway", "QFC", "Card Kingdom"])
    expect(places[0].sample_data).toBe(true)
    expect(places[1]).toMatchObject({ type: "vending machine", miles: expect.any(Number) })
    expect(r.card).toMatchObject({ type: "places", title: "4 within 10 mi of Seattle, WA", near: { label: "Seattle, WA", radiusMiles: 10 } })
  })

  it("says when a name or code was read as a whole state, and lists its places by city, without a city last", async () => {
    await getDb().insert(locations).values({ machineId: "NC", retailer: "Safeway", city: null, state: "WA", geog: { lng: -122.3, lat: 47.5 } })
    const r = await runTool("find_places", { near: "WA", radius_miles: 5, limit: 2 }, ctx())
    if (!r.ok) throw new Error(r.error)
    expect((r.data.places as { city: string }[]).map((p) => p.city)).toEqual(["Seattle", "Seattle"])
    expect(r.data.note).toContain("so the radius was ignored")
    expect(r.data.note).toContain("not the closest")
  })

  it("lists a state's places, filters by a typed retailer, and caps the list", async () => {
    const wa = await runTool("find_places", { near: "washington", retailer: "safe" }, ctx())
    expect(wa.ok && wa.data).toMatchObject({ area: "Washington", retailers: ["Safeway"], total: 2 })
    const big = await runTool("find_places", { near: "Portland, OR", limit: MAX_PLACES }, ctx())
    expect(big.ok && big.data).toMatchObject({ total: 14, showing: MAX_PLACES, note: expect.stringContaining("closest") })
    const tooMany = await runTool("find_places", { near: "Portland, OR", limit: 50 }, ctx())
    expect(tooMany).toMatchObject({ ok: false, error: expect.stringContaining("limit") })
  })

  it("explains what to fix: an unknown place, a retailer that doesn't exist, 'me' without a location", async () => {
    expect(await runTool("find_places", { near: "Atlantis" }, ctx())).toMatchObject({ ok: false, error: expect.stringContaining("No US place") })
    expect(await runTool("find_places", { near: "Seattle", retailer: "Nope" }, ctx())).toMatchObject({ ok: false, error: expect.stringContaining("retailer") })
    expect(await runTool("find_places", { near: "me" }, ctx())).toMatchObject({ ok: false, error: expect.stringContaining("shared a location") })
    // "ME" in capitals is Maine.
    expect(await runTool("area_stats", { area: "ME" }, ctx())).toMatchObject({ ok: true, data: { area: "Maine" } })
    const near = await runTool("find_places", { near: "near me", radius_miles: 2 }, ctx({ lng: -122.34, lat: 47.61 }))
    expect(near.ok && near.data).toMatchObject({ area: "you", total: 3 })
  })
})

describe("area_stats", () => {
  it("counts by kind, top retailers and top cities, without listing places", async () => {
    const r = await runTool("area_stats", { area: "WA" }, ctx())
    expect(r.ok && r.data).toEqual({
      note: expect.stringContaining('"WA" was read as the whole state of Washington.'),
      area: "Washington",
      radius_miles: null,
      total: 5,
      by_type: { "vending machines": 3, "card shops": 1, events: 1 },
      top_retailers: [
        { retailer: "Safeway", machines: 2 },
        { retailer: "QFC", machines: 1 },
      ],
      top_cities: [
        { city: "Seattle", state: "WA", locations: 4 },
        { city: "Tacoma", state: "WA", locations: 1 },
      ],
    })
    expect(r.ok && r.card).toMatchObject({ type: "stats", title: "Washington", total: 5 })
  })
})

describe("plan_route", () => {
  it("orders the stops nearest first and links Google Maps directions", async () => {
    const r = await runTool("plan_route", { place_ids: [qfc, pike], start: "Seattle, WA" }, ctx())
    expect(r.ok).toBe(true)
    if (!r.ok || r.card?.type !== "route") throw new Error("expected a route")
    expect(r.card.stops.map((s) => s.id)).toEqual([pike, qfc])
    expect(r.card.start).toMatchObject({ label: "Seattle, WA" })
    const url = new URL(r.card.mapsUrl)
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/dir/")
    expect(url.searchParams.get("destination")).toBe("47.62000,-122.32000")
    expect(url.searchParams.get("waypoints")).toBe("47.61000,-122.34000")
    expect(r.data.total_miles).toBeGreaterThan(0)
  })

  it("needs two known places", async () => {
    expect(await runTool("plan_route", { place_ids: [pike, randomUUID()] }, ctx())).toMatchObject({ ok: false, error: expect.stringContaining("two place ids") })
    expect(await runTool("plan_route", { place_ids: [pike] }, ctx())).toMatchObject({ ok: false, error: expect.stringContaining("place_ids") })
  })
})

describe("list_events and get_place", () => {
  it("lists upcoming events nearest a city", async () => {
    await getDb()
      .insert(highlights)
      .values([
        { kind: "event", title: "Card show", startsAt: new Date("2026-11-14T18:00:00Z"), geog: { lng: -104.99, lat: 39.74 }, city: "Denver", state: "CO" },
        { kind: "event", title: "League night", startsAt: new Date("2026-11-20T18:00:00Z"), geog: { lng: -122.33, lat: 47.6 }, city: "Seattle", state: "WA", isSample: true },
        { kind: "event", title: "Over", startsAt: new Date("2026-11-01T18:00:00Z"), geog: { lng: -122.33, lat: 47.6 }, city: "Seattle", state: "WA" },
      ])
    const r = await runTool("list_events", { near: "Seattle, WA" }, ctx())
    // Within 100 mi by default: Denver's show isn't counted near Seattle.
    expect(r.ok && r.data).toMatchObject({ radius_miles: 100, total: 1, events: [{ title: "League night", sample_data: true }] })
    const wide = await runTool("list_events", { near: "Seattle, WA", radius_miles: 250 }, ctx())
    expect(wide.ok && wide.data.total).toBe(1)
    const co = await runTool("list_events", { near: "Colorado" }, ctx())
    expect(co.ok && co.data.total).toBe(1)
  })

  it("gets one place with its review summary, and rejects an unknown id", async () => {
    const user = randomUUID()
    await getDb().insert(profiles).values({ id: user, username: "ash" })
    await getDb().insert(locationRatings).values({ locationId: pike, userId: user, rating: 4, text: "Restocked on Tuesdays" })
    const r = await runTool("get_place", { id: pike }, ctx())
    expect(r.ok && r.data).toMatchObject({ name: "Safeway", reviews: { count: 1, average: 4 }, recent_reviews: [{ rating: 4, text: "Restocked on Tuesdays" }] })
    expect(await runTool("get_place", { id: "nope" }, ctx())).toMatchObject({ ok: false, error: expect.stringContaining("No place") })
  })
})

describe("tool definitions", () => {
  it("give each tool an object JSON Schema with its required fields", async () => {
    const names = ASSISTANT_TOOLS.map((t) => t.name)
    expect(names).toEqual(["find_places", "area_stats", "plan_route", "list_events", "get_place"])
    const schema = inputJsonSchema(ASSISTANT_TOOLS[0])
    expect(schema).toMatchObject({ type: "object", required: ["near"], properties: { near: { type: "string" } } })
    expect(schema).not.toHaveProperty("$schema")
    await expect(runTool("delete_everything", {}, ctx())).resolves.toEqual({ ok: false, error: 'Unknown tool "delete_everything".' })
  })
})
