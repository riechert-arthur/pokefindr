import { beforeEach, describe, expect, it, vi } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
const { enqueued } = vi.hoisted(() => ({ enqueued: [] as { job: string; payload: unknown; options: unknown }[] }))
vi.mock("@/server/lib/jobs/enqueue", () => ({
  enqueueJob: async (job: string, payload: unknown, options: unknown) => {
    enqueued.push({ job, payload, options })
    return { mode: "queued", messageId: null }
  },
}))

import { getDb } from "@/server/db/client"
import { locationSubmissions, locations } from "@/server/db/schema"
import { GET, POST } from "@/app/api/submissions/route"
import { GET as duplicates } from "@/app/api/submissions/duplicates/route"
import { SUBMISSIONS_PER_DAY, createSubmission } from "@/server/services/submissions"
import { insertProfiles } from "./testDatabase"

const ASH = randomUUID()
const MISTY = randomUUID()
const URL_BASE = "http://localhost/api/submissions"

beforeEach(async () => {
  enqueued.length = 0
  await insertProfiles(getDb(), [
    { id: ASH, username: "ash" },
    { id: MISTY, username: "misty" },
  ])
})

const shop = (over: Record<string, unknown> = {}) => ({
  kind: "shop",
  name: "Mile High Cards",
  lng: -104.9876,
  lat: 39.7392,
  address: "1450 Grant St",
  city: "Denver",
  state: "CO",
  website: "https://milehighcards.example",
  sells: ["singles", "sealed"],
  ...over,
})
const inDays = (d: number) => new Date(Date.now() + d * 24 * 60 * 60 * 1000).toISOString()
const event = (over: Record<string, unknown> = {}) => ({
  kind: "event",
  name: "League night",
  lng: -105.0,
  lat: 39.7,
  city: "Denver",
  state: "CO",
  venue: "Mile High Cards",
  startsAt: inDays(3),
  isFree: true,
  ...over,
})

const post = (body: unknown, userId: string | null = ASH) =>
  POST(new NextRequest(URL_BASE, { method: "POST", body: JSON.stringify(body), headers: userId ? { "x-user-id": userId } : {} }))
const mine = (userId: string = ASH) => GET(new NextRequest(`${URL_BASE}?mine`, { headers: { "x-user-id": userId } }))

describe("POST /api/submissions", () => {
  it("stores a card shop as pending, with its fields in the payload", async () => {
    const res = await post({ submission: shop() })
    expect(res.status).toBe(201)
    const { id } = await res.json()
    const [row] = await getDb().select().from(locationSubmissions)
    expect(row).toMatchObject({ id, kind: "shop", status: "pending", submittedBy: ASH, geog: { lng: -104.9876, lat: 39.7392 } })
    expect(row.payload).toEqual({ name: "Mile High Cards", address: "1450 Grant St", city: "Denver", state: "CO", countryCode: "US", website: "https://milehighcards.example", sells: ["singles", "sealed"] })
    // Moderators hear about it, once.
    expect(enqueued).toEqual([{ job: "submission-created", payload: { submissionId: id }, options: { idempotencyKey: `submission-created:${id}` } }])
  })

  it("stores an event", async () => {
    expect((await post({ submission: event() })).status).toBe(201)
    expect((await getDb().select().from(locationSubmissions))[0]).toMatchObject({ kind: "event" })
  })

  it("needs a session", async () => {
    expect((await post({ submission: shop() }, null)).status).toBe(401)
  })

  it("checks each kind's fields, and says which one is wrong", async () => {
    const bad = async (submission: unknown) => {
      const res = await post({ submission })
      expect(res.status).toBe(400)
      return res.json()
    }
    expect(await bad(shop({ name: " " }))).toMatchObject({ field: "name" })
    expect(await bad(shop({ website: "javascript:alert(1)" }))).toMatchObject({ field: "website" })
    expect(await bad(shop({ sells: ["pokemon"] }))).toMatchObject({ field: "sells.0" })
    expect(await bad(shop({ lat: 120 }))).toMatchObject({ field: "lat" })
    expect(await bad({ ...shop(), kind: "vending" })).toMatchObject({ field: "kind" })
    expect(await bad(event({ startsAt: "next friday" }))).toMatchObject({ field: "startsAt" })
    expect(await bad(event({ endsAt: inDays(2) }))).toMatchObject({ field: "endsAt" })
    expect(await bad(event({ startsAt: inDays(-3) }))).toMatchObject({ field: "startsAt", error: "That date has passed." })
    expect(await bad(event({ startsAt: inDays(400) }))).toMatchObject({ field: "startsAt" })
    // An end far off would keep it listed for good; one already past means it's over.
    expect(await bad(event({ endsAt: "9999-12-31T00:00:00Z" }))).toMatchObject({ field: "endsAt", error: "An event can last at most 14 days." })
    expect(await bad(event({ startsAt: inDays(-0.9), endsAt: inDays(-0.5) }))).toMatchObject({ field: "endsAt", error: "That event has already ended." })
    expect(await getDb().select().from(locationSubmissions)).toEqual([])
  })

  it("returns places of the same kind within 150 m, and stores it once the person confirms", async () => {
    const [near] = await getDb()
      .insert(locations)
      .values([
        { name: "Grant Street Games", kind: "shop", city: "Denver", state: "CO", geog: { lng: -104.9886, lat: 39.7392 } }, // ~85 m west
        { name: "Too far", kind: "shop", geog: { lng: -104.9676, lat: 39.7392 } }, // ~1.7 km
        { name: "A vending machine", kind: "vending", machineId: "Q1", geog: { lng: -104.9876, lat: 39.7393 } }, // other kind
        { name: "Closed for good", kind: "shop", isActive: false, geog: { lng: -104.9876, lat: 39.7392 } },
      ])
      .returning()
    const res = await post({ submission: shop() })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.duplicates).toEqual([{ id: near.id, name: "Grant Street Games", source: "location", address: "", city: "Denver", state: "CO", meters: expect.any(Number) }])
    expect(body.duplicates[0].meters).toBeGreaterThan(70)
    expect(body.duplicates[0].meters).toBeLessThan(100)
    expect(await getDb().select().from(locationSubmissions)).toEqual([])

    expect((await post({ submission: shop(), confirmDuplicate: true })).status).toBe(201)
  })

  it("warns about your own pending submission nearby, but not someone else's", async () => {
    await createSubmission({ userId: MISTY, input: shop() as never })
    expect((await post({ submission: shop() })).status).toBe(201)
    const again = await post({ submission: shop({ name: "Mile High Cards (again)" }) })
    expect(again.status).toBe(409)
    expect((await again.json()).duplicates).toMatchObject([{ source: "submission", name: "Mile High Cards" }])
  })

  it(`allows ${SUBMISSIONS_PER_DAY} a day per person, even when sent at once`, async () => {
    const many = Array.from({ length: SUBMISSIONS_PER_DAY + 3 }, (_, i) => post({ submission: shop({ name: `Shop ${i}`, lng: -104 - i * 0.1 }) }))
    const statuses = (await Promise.all(many)).map((r) => r.status).sort()
    expect(statuses.filter((s) => s === 201)).toHaveLength(SUBMISSIONS_PER_DAY)
    expect(statuses.filter((s) => s === 429)).toHaveLength(3)
    // Someone else still can.
    expect((await post({ submission: shop({ lng: -90 }) }, MISTY)).status).toBe(201)
  })
})

describe("GET /api/submissions?mine", () => {
  it("lists only your own, newest first", async () => {
    await post({ submission: shop() })
    await post({ submission: event() })
    await post({ submission: shop({ name: "Misty's shop", lng: -80 }) }, MISTY)
    const res = await mine()
    expect(res.status).toBe(200)
    const { submissions } = await res.json()
    expect(submissions.map((s: { name: string }) => s.name)).toEqual(["League night", "Mile High Cards"])
    expect(submissions[1]).toMatchObject({ kind: "shop", status: "pending", rejectReason: null, city: "Denver", lng: -104.9876, lat: 39.7392, startsAt: null, locationId: null })
    expect(submissions[0].startsAt).toEqual(expect.any(String))
  })

  it("needs ?mine and a session", async () => {
    expect((await GET(new NextRequest(URL_BASE, { headers: { "x-user-id": ASH } }))).status).toBe(400)
    expect((await GET(new NextRequest(`${URL_BASE}?mine`))).status).toBe(401)
  })
})

describe("GET /api/submissions/duplicates", () => {
  it("lists places of the kind near a point", async () => {
    await getDb().insert(locations).values({ name: "Grant Street Games", kind: "shop", geog: { lng: -104.9886, lat: 39.7392 } })
    const at = (kind: string) => duplicates(new NextRequest(`${URL_BASE}/duplicates?kind=${kind}&lng=-104.9876&lat=39.7392`, { headers: { "x-user-id": ASH } }))
    expect((await (await at("shop")).json()).duplicates).toHaveLength(1)
    expect((await (await at("event")).json()).duplicates).toHaveLength(0)
    expect((await at("vending")).status).toBe(400)
  })
})
