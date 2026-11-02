import { describe, it, expect, beforeEach, vi } from "vitest"
import { revalidateTag } from "next/cache"
import { getDb } from "@/server/db/client"
import { locations, profiles } from "@/server/db/schema"
import {
  NotFoundError,
  createReview,
  deleteReview,
  listLocationReviews,
  listUserReviews,
  updateReview,
} from "@/server/services/reviews"

async function seed() {
  const db = getDb()
  const [ash, misty] = await db
    .insert(profiles)
    .values([
      { id: crypto.randomUUID(), username: "ash" },
      { id: crypto.randomUUID(), username: "misty" },
    ])
    .returning()
  const [frys, closed] = await db
    .insert(locations)
    .values([
      { machineId: "Q1", retailer: "Frys", address: "1 Main St", city: "Mesa", state: "AZ", geog: { lng: -111, lat: 33 } },
      // Same coordinates as Frys: reviews must not leak between them.
      { machineId: "Q2", retailer: "Closed", geog: { lng: -111, lat: 33 }, isActive: false },
    ])
    .returning()
  return { ash, misty, frys, closed }
}

describe("reviews service", () => {
  beforeEach(() => vi.mocked(revalidateTag).mockClear())

  it("creates and lists reviews by location id, with a summary", async () => {
    const { ash, misty, frys } = await seed()
    await createReview({ locationId: frys.id, userId: ash.id, rating: 5, text: "Fully stocked" })
    await createReview({ locationId: frys.id, userId: misty.id, rating: 2, text: "Empty" })

    const result = await listLocationReviews(frys.id)
    expect(result.summary).toEqual({ count: 2, average: 3.5 })
    expect(result.reviews.map((r) => r.username).sort()).toEqual(["ash", "misty"])
    expect(revalidateTag).toHaveBeenCalledWith(`location:${frys.id}:reviews`)
  })

  it("keeps reviews of co-located machines separate", async () => {
    const { ash, frys, closed } = await seed()
    await createReview({ locationId: frys.id, userId: ash.id, rating: 4, text: "ok" })
    expect((await listLocationReviews(closed.id)).reviews).toHaveLength(0)
  })

  it("refuses reviews for unknown or inactive locations", async () => {
    const { ash, closed } = await seed()
    await expect(
      createReview({ locationId: closed.id, userId: ash.id, rating: 4, text: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError)
    await expect(
      createReview({ locationId: crypto.randomUUID(), userId: ash.id, rating: 4, text: "x" }),
    ).rejects.toBeInstanceOf(NotFoundError)
  })

  it("only lets the author edit or delete a review", async () => {
    const { ash, misty, frys } = await seed()
    const { id } = await createReview({ locationId: frys.id, userId: ash.id, rating: 3, text: "meh" })

    expect(await updateReview({ reviewId: id, userId: misty.id, rating: 1, text: "hijack" })).toBeNull()
    expect(await deleteReview({ reviewId: id, userId: misty.id })).toBe(false)

    const updated = await updateReview({ reviewId: id, userId: ash.id, rating: 4, text: "better" })
    expect(updated).toMatchObject({ rating: 4, text: "better" })

    const mine = await listUserReviews(ash.id)
    expect(mine).toEqual([
      expect.objectContaining({
        id,
        rating: 4,
        comment: "better",
        location: { id: frys.id, name: "Frys", description: "1 Main St, Mesa, AZ" },
      }),
    ])

    expect(await deleteReview({ reviewId: id, userId: ash.id })).toBe(true)
    expect(await listUserReviews(ash.id)).toEqual([])
  })
})
