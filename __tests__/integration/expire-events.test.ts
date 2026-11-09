import { describe, expect, it } from "vitest"
import { getDb } from "@/server/db/client"
import { eventDetails, highlights, locations } from "@/server/db/schema"
import { expireEvents } from "@/server/services/expire-events"
import { getUpcomingEvents } from "@/server/services/highlights"
import { jobs } from "@/server/lib/jobs/registry"
import vercel from "../../vercel.json"

const NOW = new Date("2026-11-10T07:05:00Z")
const at = (iso: string) => new Date(iso)

describe("expire-events", () => {
  it("hides events once they're over, the next day, and keeps everything else", async () => {
    const db = getDb()
    const rows = await db
      .insert(locations)
      .values([
        { name: "Ended yesterday", kind: "event", geog: { lng: -105, lat: 39.7 } },
        { name: "No end, started two days ago", kind: "event", geog: { lng: -105, lat: 39.7 } },
        { name: "No end, started last night", kind: "event", geog: { lng: -105, lat: 39.7 } },
        { name: "Next week", kind: "event", geog: { lng: -105, lat: 39.7 } },
        { name: "A shop", kind: "shop", geog: { lng: -105, lat: 39.7 } },
      ])
      .returning()
    const [ended, noEndOld, noEndNew, upcoming, shop] = rows
    await db.insert(eventDetails).values([
      { locationId: ended.id, startsAt: at("2026-11-08T17:00:00Z"), endsAt: at("2026-11-09T22:00:00Z") },
      { locationId: noEndOld.id, startsAt: at("2026-11-08T01:00:00Z") },
      { locationId: noEndNew.id, startsAt: at("2026-11-10T01:00:00Z") },
      { locationId: upcoming.id, startsAt: at("2026-11-17T01:00:00Z") },
    ])
    await db.insert(highlights).values([
      { kind: "event", title: "Old card show", startsAt: at("2026-11-01T18:00:00Z"), geog: { lng: -104.99, lat: 39.74 } },
      { kind: "event", title: "Card show soon", startsAt: at("2026-11-14T18:00:00Z"), geog: { lng: -104.99, lat: 39.74 } },
    ])

    expect(await expireEvents(db, NOW)).toEqual({ locations: 2, highlights: 1 })
    const active = Object.fromEntries((await db.select().from(locations)).map((l) => [l.name, l.isActive]))
    expect(active).toEqual({
      "Ended yesterday": false,
      "No end, started two days ago": false,
      "No end, started last night": true,
      "Next week": true,
      "A shop": true,
    })
    expect((await db.select().from(highlights)).map((h) => [h.title, h.isPublished]).sort()).toEqual([
      ["Card show soon", true],
      ["Old card show", false],
    ])
    expect(shop.isActive).toBe(true)
    // Running it again changes nothing.
    expect(await expireEvents(db, NOW)).toEqual({ locations: 0, highlights: 0 })
    expect((await getUpcomingEvents(db, NOW, 10)).map((e) => e.title).sort()).toEqual(["Card show soon", "Next week", "No end, started last night"])
  })

  it("runs daily from Vercel Cron", () => {
    expect(jobs["expire-events"]).toBeDefined()
    expect(vercel.crons).toContainEqual({ path: "/api/jobs/expire-events", schedule: "5 6 * * *" })
  })
})
