import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { locations, profiles, statusReports } from "@/server/db/schema"
import { REPORTS_PER_DAY, addLocationReport, listRecentReports } from "@/server/services/reports"
import { POST } from "@/app/api/locations/[id]/reports/route"

let alice: string
let bob: string
let store: string
let gone: string

beforeEach(async () => {
  const db = getDb()
  alice = randomUUID()
  bob = randomUUID()
  await db.insert(profiles).values([
    { id: alice, username: "alice" },
    { id: bob, username: "bob" },
  ])
  const rows = await db
    .insert(locations)
    .values([
      { machineId: "Q1", retailer: "QFC", city: "Seattle", state: "WA", geog: { lng: -122.32, lat: 47.62 } },
      { machineId: "OLD", retailer: "Old", geog: { lng: 0, lat: 0 }, isActive: false },
    ])
    .returning({ id: locations.id })
  ;[store, gone] = rows.map((r) => r.id)
})

describe("location reports", () => {
  it("stores a reason-only report, once per user and location a day", async () => {
    const now = new Date("2026-11-07T12:00:00Z")
    expect(await addLocationReport({ locationId: store, userId: alice, reason: "gone" }, getDb(), now)).toBe("added")
    expect(await addLocationReport({ locationId: store, userId: alice, reason: "empty" }, getDb(), new Date("2026-11-07T20:00:00Z"))).toBe("duplicate")
    expect(await addLocationReport({ locationId: store, userId: bob, reason: "wrong_location", comment: "  Pin is a block north  " }, getDb(), now)).toBe("added")
    expect(await addLocationReport({ locationId: store, userId: alice, reason: "empty" }, getDb(), new Date("2026-11-08T13:00:00Z"))).toBe("added")
    expect(await addLocationReport({ locationId: gone, userId: alice, reason: "gone" }, getDb(), now)).toBe("not_found")
    const rows = await getDb().select().from(statusReports)
    expect(rows).toHaveLength(3)
    expect(rows.every((r) => r.status === null)).toBe(true)
  })

  it("rate limits a user past the daily limit", async () => {
    const db = getDb()
    const many = await db
      .insert(locations)
      .values(Array.from({ length: REPORTS_PER_DAY + 1 }, (_, i) => ({ machineId: `M${i}`, retailer: "QFC", geog: { lng: -122 + i * 0.01, lat: 47 } })))
      .returning({ id: locations.id })
    const now = new Date("2026-11-07T12:00:00Z")
    const results = []
    for (const { id } of many) results.push(await addLocationReport({ locationId: id, userId: alice, reason: "empty" }, db, now))
    expect(results.filter((r) => r === "added")).toHaveLength(REPORTS_PER_DAY)
    expect(results.at(-1)).toBe("rate_limited")
  })

  it("lists recent reports for admins, newest first, with the location and a count per location", async () => {
    await addLocationReport({ locationId: store, userId: alice, reason: "gone" }, getDb(), new Date("2026-11-06T12:00:00Z"))
    await addLocationReport({ locationId: store, userId: bob, reason: "other", comment: "Moved inside" }, getDb(), new Date("2026-11-07T09:00:00Z"))
    const list = await listRecentReports({}, getDb(), new Date("2026-11-07T12:00:00Z"))
    expect(list.map((r) => [r.username, r.reason, r.comment, r.reportsForLocation])).toEqual([
      ["bob", "other", "Moved inside", 2],
      ["alice", "gone", null, 2],
    ])
    expect(list[0].location).toMatchObject({ id: store, name: "QFC", city: "Seattle", state: "WA", isActive: true })
  })

  it("POST needs a user and a known reason", async () => {
    const post = (body: unknown, userId?: string) =>
      POST(new NextRequest(`http://localhost/api/locations/${store}/reports`, { method: "POST", body: JSON.stringify(body), headers: userId ? { "x-user-id": userId } : {} }), {
        params: Promise.resolve({ id: store }),
      })
    expect((await post({ reason: "gone" })).status).toBe(401)
    expect((await post({ reason: "haunted" }, alice)).status).toBe(400)
    const ok = await post({ reason: "gone" }, alice)
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ success: true, duplicate: false })
    expect(await (await post({ reason: "gone" }, alice)).json()).toEqual({ success: true, duplicate: true })
  })
})
