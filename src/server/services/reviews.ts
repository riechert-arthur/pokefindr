import "server-only"
import { and, desc, eq, sql } from "drizzle-orm"
import { revalidateTag } from "next/cache"
import { getDb, type Database } from "@/server/db/client"
import { locationRatings, locations, profiles } from "@/server/db/schema"
import type { ReviewFormValues } from "@/lib/schemas"

export const locationReviewsTag = (locationId: string) => `location:${locationId}:reviews`

export interface LocationReview {
  id: string
  rating: number
  text: string
  username: string
  createdAt: string | null
}

export interface LocationReviews {
  reviews: LocationReview[]
  summary: { average: number; count: number }
}

export interface UserReview {
  id: string
  rating: number
  comment: string
  created: string | null
  location: { id: string; name: string; description: string }
}

export class NotFoundError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Ids come from URLs; reject malformed ones before Postgres does. */
export const isUuid = (value: string) => UUID_RE.test(value)

const toIso = (d: Date | null) => (d ? d.toISOString() : null)

/** Reviews for one location, newest first, with the author's username. */
export async function listLocationReviews(
  locationId: string,
  db: Database = getDb(),
): Promise<LocationReviews> {
  const rows = await db
    .select({
      id: locationRatings.id,
      rating: locationRatings.rating,
      text: locationRatings.text,
      username: profiles.username,
      createdAt: locationRatings.createdAt,
    })
    .from(locationRatings)
    .leftJoin(profiles, eq(profiles.id, locationRatings.userId))
    .where(eq(locationRatings.locationId, locationId))
    .orderBy(desc(locationRatings.createdAt), desc(locationRatings.id))

  const reviews = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.text ?? "",
    username: r.username ?? "Unknown",
    createdAt: toIso(r.createdAt),
  }))
  const total = reviews.reduce((sum, r) => sum + r.rating, 0)

  return {
    reviews,
    summary: {
      count: reviews.length,
      average: reviews.length ? Math.round((total / reviews.length) * 10) / 10 : 0,
    },
  }
}

/** All reviews written by a user, newest first. */
export async function listUserReviews(userId: string, db: Database = getDb()): Promise<UserReview[]> {
  const rows = await db
    .select({
      id: locationRatings.id,
      rating: locationRatings.rating,
      text: locationRatings.text,
      createdAt: locationRatings.createdAt,
      locationId: locations.id,
      locationName: sql<string>`coalesce(${locations.retailer}, ${locations.name}, '')`,
      locationDescription: sql<string>`coalesce(${locations.description}, concat_ws(', ', ${locations.address}, ${locations.city}, ${locations.state}))`,
    })
    .from(locationRatings)
    .innerJoin(locations, eq(locations.id, locationRatings.locationId))
    .where(eq(locationRatings.userId, userId))
    .orderBy(desc(locationRatings.createdAt), desc(locationRatings.id))

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.text ?? "",
    created: toIso(r.createdAt),
    location: { id: r.locationId, name: r.locationName, description: r.locationDescription },
  }))
}

/** Adds a review to an active location. Throws NotFoundError if there is none. */
export async function createReview(
  input: { locationId: string; userId: string } & ReviewFormValues,
  db: Database = getDb(),
): Promise<{ id: string }> {
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, input.locationId), eq(locations.isActive, true)))
  if (!location) throw new NotFoundError("Location not found")

  const [review] = await db
    .insert(locationRatings)
    .values({
      locationId: input.locationId,
      userId: input.userId,
      rating: input.rating,
      text: input.text,
    })
    .returning({ id: locationRatings.id })

  revalidateTag(locationReviewsTag(input.locationId))
  return review
}

/** Edits a review the user owns. Returns null if it doesn't exist or isn't theirs. */
export async function updateReview(
  input: { reviewId: string; userId: string } & ReviewFormValues,
  db: Database = getDb(),
) {
  const [updated] = await db
    .update(locationRatings)
    .set({ rating: input.rating, text: input.text })
    .where(and(eq(locationRatings.id, input.reviewId), eq(locationRatings.userId, input.userId)))
    .returning()
  if (!updated) return null

  revalidateTag(locationReviewsTag(updated.locationId))
  return updated
}

/** Deletes a review the user owns. Returns false if it doesn't exist or isn't theirs. */
export async function deleteReview(
  input: { reviewId: string; userId: string },
  db: Database = getDb(),
): Promise<boolean> {
  const [deleted] = await db
    .delete(locationRatings)
    .where(and(eq(locationRatings.id, input.reviewId), eq(locationRatings.userId, input.userId)))
    .returning({ locationId: locationRatings.locationId })
  if (!deleted) return false

  revalidateTag(locationReviewsTag(deleted.locationId))
  return true
}
