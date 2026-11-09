import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { cardShopDetails, eventDetails, locationRatings, locationSubmissions, locations, profiles } from "@/server/db/schema"
import { GET } from "@/app/api/admin/submissions/route"
import { POST } from "@/app/api/admin/submissions/[id]/route"
import { createSubmission, listMySubmissions } from "@/server/services/submissions"
import { UNDO_MS, approveSubmission, undoDecision } from "@/server/services/moderation"
import { regionAt } from "@/server/geo/regions"
import type { ModerationItem } from "@/lib/submissions/moderation"
import type { SubmissionInput } from "@/lib/submissions/schemas"
import { insertProfiles } from "./testDatabase"

const ASH = randomUUID()
const MOD = randomUUID()
const MOD2 = randomUUID()
const BASE = "http://localhost/api/admin/submissions"

beforeEach(async () => {
  await insertProfiles(getDb(), [
    { id: ASH, username: "ash" },
    { id: MOD, username: "brock" },
    { id: MOD2, username: "jenny" },
  ])
  await getDb().update(profiles).set({ role: "moderator" }).where(eq(profiles.id, MOD))
  await getDb().update(profiles).set({ role: "admin" }).where(eq(profiles.id, MOD2))
})

const shop: SubmissionInput = {
  kind: "shop",
  name: "Mile High Cards",
  lng: -104.9876,
  lat: 39.7392,
  address: "1450 Grant St",
  city: "Denver",
  state: "CO",
  countryCode: "US",
  website: "https://milehighcards.example",
  sells: ["singles"],
}
const event: SubmissionInput = {
  kind: "event",
  name: "League night",
  lng: -105.0,
  lat: 39.7,
  city: "Denver",
  state: "CO",
  countryCode: "US",
  startsAt: new Date(Date.now() + 3 * 864e5).toISOString(),
  isFree: true,
}
async function submit(input: SubmissionInput = shop): Promise<string> {
  const r = await createSubmission({ userId: ASH, input, confirmDuplicate: true })
  if (r.status !== "created") throw new Error(r.status)
  return r.id
}

const list = (userId: string) => GET(new NextRequest(BASE, { headers: { "x-user-id": userId } }))
const act = (id: string, body: unknown, userId = MOD) =>
  POST(new NextRequest(`${BASE}/${id}`, { method: "POST", body: JSON.stringify(body), headers: { "x-user-id": userId } }), { params: Promise.resolve({ id }) })

describe("the review queue", () => {
  it("is for moderators and admins only", async () => {
    const id = await submit()
    expect((await list(ASH)).status).toBe(403)
    expect((await act(id, { action: "approve" }, ASH)).status).toBe(403)
    expect((await list(MOD)).status).toBe(200)
    expect((await list(MOD2)).status).toBe(200)
  })

  it("lists pending submissions oldest first, with automatic checks", async () => {
    const first = await submit({ ...shop, address: undefined, website: undefined, state: "WY" })
    await getDb().insert(locations).values({ name: "Grant Street Games", kind: "shop", geog: { lng: -104.99, lat: 39.7392 } })
    const second = await submit(event)
    const third = await submit({ ...shop, name: "Offshore", lng: -140, lat: 30 })
    const { queue } = (await (await list(MOD)).json()) as { queue: ModerationItem[] }
    expect(queue.map((q) => q.id)).toEqual([first, second, third])
    const checks = (i: number) => Object.fromEntries(queue[i].checks.map((c) => [c.key, c]))
    expect(checks(0)).toMatchObject({
      country: { ok: true, label: "In Colorado", detail: "The form says WY, but the pin is in CO." },
      duplicate: { ok: false, detail: expect.stringContaining("Grant Street Games") },
      address: { ok: false },
      website: { ok: false },
    })
    expect(checks(1)).toMatchObject({ country: { ok: true }, duplicate: { ok: true }, date: { ok: true } })
    expect(checks(1).website).toBeUndefined()
    expect(checks(2).country).toMatchObject({ ok: false, label: "Outside a supported country" })
    expect(queue[0]).toMatchObject({ submittedBy: "ash", status: "pending", fields: { name: "Mile High Cards", city: "Denver" } })
  })

  it("approving puts the place and its details on the map, in one go", async () => {
    const id = await submit()
    expect(await getDb().select().from(locations)).toEqual([])
    const res = await act(id, { action: "approve" })
    expect(res.status).toBe(200)
    const { locationId } = await res.json()
    const [loc] = await getDb().select().from(locations).where(eq(locations.id, locationId))
    expect(loc).toMatchObject({ kind: "shop", name: "Mile High Cards", address: "1450 Grant St", state: "CO", countryCode: "US", isActive: true, source: "submission", createdBy: ASH })
    expect(await getDb().select().from(cardShopDetails)).toMatchObject([{ locationId, website: "https://milehighcards.example", sells: ["singles"] }])
    const [sub] = await getDb().select().from(locationSubmissions)
    expect(sub).toMatchObject({ status: "approved", locationId, reviewedBy: MOD })
    // The submitter sees it approved, and someone else can't decide it again.
    expect((await listMySubmissions(ASH))[0]).toMatchObject({ status: "approved", locationId })
    expect((await act(id, { action: "approve" }, MOD2)).status).toBe(409)
  })

  it("approving an event stores its times in event_details", async () => {
    const id = await submit(event)
    await act(id, { action: "approve" })
    const [details] = await getDb().select().from(eventDetails)
    expect(details).toMatchObject({ startsAt: new Date(event.kind === "event" ? event.startsAt : ""), isFree: true })
  })

  it("rejecting needs a reason, which the submitter sees", async () => {
    const id = await submit()
    expect((await act(id, { action: "reject" })).status).toBe(400)
    expect((await act(id, { action: "reject", reason: "spam" })).status).toBe(200)
    expect((await listMySubmissions(ASH))[0]).toMatchObject({ status: "rejected", rejectReason: "spam" })
    expect(await getDb().select().from(locations)).toEqual([])
    const { queue, decided } = await (await list(MOD)).json()
    expect(queue).toEqual([])
    expect(decided).toMatchObject([{ id, status: "rejected", rejectReason: "spam", reviewedBy: "brock" }])
  })

  it("undo puts it back in the queue and takes an approved place off the map", async () => {
    const id = await submit()
    await act(id, { action: "approve" })
    expect((await act(id, { action: "undo" }, MOD2)).status).toBe(409) // not their decision
    expect((await act(id, { action: "undo" })).status).toBe(200)
    expect(await getDb().select().from(locations)).toEqual([])
    expect(await getDb().select().from(cardShopDetails)).toEqual([])
    expect((await getDb().select().from(locationSubmissions))[0]).toMatchObject({ status: "pending", locationId: null, reviewedBy: null })
  })

  it("undo refuses once people rated or reported the place, and changes nothing", async () => {
    const id = await submit()
    const { locationId } = await (await act(id, { action: "approve" })).json()
    await getDb().insert(locationRatings).values({ locationId, userId: MOD2, rating: 5 })
    const res = await act(id, { action: "undo" })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/would delete their posts/)
    expect(await getDb().select().from(locationRatings)).toHaveLength(1)
    expect((await getDb().select().from(locationSubmissions))[0]).toMatchObject({ status: "approved", locationId })
  })

  it("undo only works for an hour", async () => {
    const id = await submit()
    const at = new Date()
    await approveSubmission(id, MOD, getDb(), at)
    expect(await undoDecision(id, MOD, getDb(), new Date(at.getTime() + UNDO_MS + 1000))).toEqual({ status: "too_late" })
  })

  it("answers 404 for an unknown submission", async () => {
    expect((await act(randomUUID(), { action: "approve" })).status).toBe(404)
    expect((await act("not-a-uuid", { action: "approve" })).status).toBe(404)
  })
})

describe("regionAt", () => {
  it("finds the state a point is in, and nothing at sea or abroad", () => {
    expect(regionAt(-104.99, 39.74)).toMatchObject({ country: "US", region: "CO" })
    expect(regionAt(-157.86, 21.31)).toMatchObject({ region: "HI" })
    expect(regionAt(-140, 30)).toBeNull()
    expect(regionAt(-79.38, 43.65)).toBeNull() // Toronto
  })
})
