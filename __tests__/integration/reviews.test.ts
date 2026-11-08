import { describe, it, expect, beforeEach } from "vitest"
import { randomUUID } from "node:crypto"
import { getDb } from "@/server/db/client"
import { locations, profiles } from "@/server/db/schema"
import {
  addReview,
  deleteReview,
  getPanelReviews,
  listLocationReviews,
  listUserReviews,
  updateReview,
} from "@/server/services/reviews"

let alice: string
let bob: string
let store: string
let nextDoor: string

beforeEach(async () => {
  const db = getDb()
  alice = randomUUID()
  bob = randomUUID()
  await db.insert(profiles).values([
    { id: alice, username: "alice" },
    { id: bob, username: "bob" },
  ])
  // Two machines a few metres apart: reviews must stay with the one they were written for.
  const rows = await db
    .insert(locations)
    .values([
      { machineId: "Q1", retailer: "Frys", geog: { lng: -111.544047, lat: 33.413887 } },
      { machineId: "Q2", retailer: "Frys", geog: { lng: -111.544, lat: 33.41389 } },
    ])
    .returning({ id: locations.id })
  ;[store, nextDoor] = rows.map((r) => r.id)
})

describe("reviews", () => {
  it("attaches reviews to the location id they were written for", async () => {
    expect(await addReview({ locationId: store, userId: alice, rating: 5, text: "Stocked" })).toEqual(expect.any(String))
    expect(await addReview({ locationId: nextDoor, userId: bob, rating: 2, text: "Empty" })).toEqual(expect.any(String))

    expect(await listLocationReviews(store)).toEqual([{ rating: 5, text: "Stocked", username: "alice" }])
    expect(await listLocationReviews(nextDoor)).toEqual([{ rating: 2, text: "Empty", username: "bob" }])
  })

  it("lists a location's reviews for the panel, newest first, with the average and the viewer's own marked", async () => {
    const first = await addReview({ locationId: store, userId: alice, rating: 5, text: "Stocked" })
    const second = await addReview({ locationId: store, userId: bob, rating: 2, text: "" })
    const asAlice = await getPanelReviews(store, alice)
    expect(asAlice.count).toBe(2)
    expect(asAlice.average).toBe(3.5)
    expect(asAlice.reviews.map((r) => [r.id, r.username, r.rating, r.text, r.mine])).toEqual([
      [second, "bob", 2, "", false],
      [first, "alice", 5, "Stocked", true],
    ])
    expect(asAlice.reviews[0].createdAt).toMatch(/^\d{4}-\d\d-\d\dT/)
    expect((await getPanelReviews(store, null)).reviews.every((r) => !r.mine)).toBe(true)
    expect(await getPanelReviews(nextDoor, alice)).toEqual({ reviews: [], count: 0, average: 0 })
  })

  it("refuses reviews for unknown or inactive locations", async () => {
    const [closed] = await getDb()
      .insert(locations)
      .values({ machineId: "GONE", isActive: false })
      .returning({ id: locations.id })

    expect(await addReview({ locationId: randomUUID(), userId: alice, rating: 3, text: "?" })).toBeNull()
    expect(await addReview({ locationId: closed.id, userId: alice, rating: 3, text: "?" })).toBeNull()
  })

  it("lists, updates and deletes only the user's own reviews", async () => {
    await addReview({ locationId: store, userId: alice, rating: 4, text: "Good" })
    const [mine] = await listUserReviews(alice)
    expect(mine).toMatchObject({ rating: 4, comment: "Good", location: { id: store, name: "Frys" } })
    expect(await listUserReviews(bob)).toEqual([])

    expect(await updateReview(mine.id, bob, { rating: 1, text: "Hijacked" })).toBe(false)
    expect(await deleteReview(mine.id, bob)).toBe(false)

    expect(await updateReview(mine.id, alice, { rating: 5, text: "Great" })).toBe(true)
    expect(await listLocationReviews(store)).toEqual([{ rating: 5, text: "Great", username: "alice" }])

    expect(await deleteReview(mine.id, alice)).toBe(true)
    expect(await listUserReviews(alice)).toEqual([])
  })
})
