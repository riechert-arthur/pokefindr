import { describe, expect, it } from "vitest"
import { getDb } from "@/server/db/client"
import { highlights, locations } from "@/server/db/schema"
import { getHotspots, getUpcomingEvents } from "@/server/services/highlights"

/** `n` vending machines in a city, spread a little around a point. */
const machines = (city: string, state: string, lng: number, lat: number, n: number, kind: "vending" | "shop" = "vending") =>
  Array.from({ length: n }, (_, i) => ({
    machineId: kind === "vending" ? `${city}-${i}` : null,
    name: kind === "shop" ? `${city} shop ${i}` : null,
    retailer: kind === "vending" ? "QFC" : null,
    kind,
    city,
    state,
    geog: { lng: lng + (i % 3) * 0.01, lat: lat + Math.floor(i / 3) * 0.01 },
  }))

describe("getHotspots", () => {
  it("ranks cities by vending machines within 15 mi, one per metro, among cities with 5 of their own", async () => {
    await getDb()
      .insert(locations)
      .values([
        ...machines("Portland", "OR", -122.68, 45.52, 8),
        ...machines("Vancouver", "WA", -122.66, 45.64, 6), // ~8 mi from Portland: same metro
        ...machines("Seattle", "WA", -122.33, 47.62, 7),
        ...machines("Tiny", "WA", -122.3, 47.3, 2), // too few of its own to name a hotspot
        ...machines("Denver", "CO", -104.99, 39.74, 5),
        ...machines("Denver", "CO", -104.99, 39.74, 9, "shop"), // shops don't count
        ...machines("Phoenix", "AZ", -112.07, 33.45, 5),
      ])
    const hotspots = await getHotspots(getDb(), 3)
    expect(hotspots.map((h) => [h.city, h.state, h.count])).toEqual([
      ["Portland", "OR", 14],
      ["Seattle", "WA", 7],
      ["Denver", "CO", 5],
    ])
    expect(hotspots[0].lng).toBeCloseTo(-122.67, 2)
  })
})

describe("getUpcomingEvents", () => {
  it("lists published events that haven't ended, soonest first, at their own point or their location", async () => {
    const db = getDb()
    const [shop] = await db
      .insert(locations)
      .values({ name: "Den of Cards", kind: "shop", city: "Boulder", state: "CO", geog: { lng: -105.27, lat: 40.01 } })
      .returning()
    const now = new Date("2026-11-07T12:00:00Z")
    const at = (iso: string) => new Date(iso)
    await db.insert(highlights).values([
      { kind: "event", title: "Past show", startsAt: at("2026-11-01T18:00:00Z"), city: "Denver", state: "CO", geog: { lng: -104.99, lat: 39.74 } },
      { kind: "event", title: "Restock weekend", startsAt: at("2026-11-06T18:00:00Z"), endsAt: at("2026-11-08T18:00:00Z"), city: "Sacramento", state: "CA", geog: { lng: -121.49, lat: 38.58 } },
      { kind: "event", title: "Trade night", startsAt: at("2026-11-12T01:00:00Z"), locationId: shop.id },
      { kind: "event", title: "Hidden", startsAt: at("2026-11-10T18:00:00Z"), isPublished: false, geog: { lng: 0, lat: 0 } },
      { kind: "featured", title: "Not an event", geog: { lng: 0, lat: 0 } },
      { kind: "event", title: "Card show", startsAt: at("2026-11-13T18:00:00Z"), city: "Denver", state: "CO", geog: { lng: -104.99, lat: 39.74 }, isSample: true },
      // Started two hours ago with no end: still on today.
      { kind: "event", title: "League night", startsAt: at("2026-11-07T10:00:00Z"), city: "Dallas", state: "TX", geog: { lng: -96.8, lat: 32.78 } },
    ])
    const events = await getUpcomingEvents(db, now, 5)
    expect(events.map((e) => e.title)).toEqual(["Restock weekend", "League night", "Trade night", "Card show"])
    expect(events[2]).toMatchObject({ city: "Boulder", state: "CO", lng: -105.27, lat: 40.01, isSample: false, endsAt: null })
    expect(events[3]).toMatchObject({ startsAt: "2026-11-13T18:00:00.000Z", isSample: true })
    expect(await getUpcomingEvents(db, now, 1)).toHaveLength(1)
  })

  it("goes with its location when the location is deleted", async () => {
    const db = getDb()
    const [shop] = await db.insert(locations).values({ name: "Den of Cards", kind: "shop", geog: { lng: -105.27, lat: 40.01 } }).returning()
    await db.insert(highlights).values({ kind: "event", title: "Trade night", startsAt: new Date(), locationId: shop.id })
    await db.delete(locations)
    expect(await db.select().from(highlights)).toEqual([])
  })

  it("rejects an event without a place or a start", async () => {
    const db = getDb()
    await expect(db.insert(highlights).values({ kind: "event", title: "Nowhere", startsAt: new Date() })).rejects.toThrow()
    await expect(db.insert(highlights).values({ kind: "event", title: "Whenever", geog: { lng: 0, lat: 0 } })).rejects.toThrow()
  })
})
