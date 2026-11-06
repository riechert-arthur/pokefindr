import "server-only"
import { and, desc, eq } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locationRatings, locations, profiles } from "@/server/db/schema"

export interface LocationReview {
  rating: number
  text: string
  username: string
}

/** Reviews of one location, newest first. */
export async function listLocationReviews(
  locationId: string,
  db: Database = getDb(),
): Promise<LocationReview[]> {
  const rows = await db
    .select({ rating: locationRatings.rating, text: locationRatings.text, username: profiles.username })
    .from(locationRatings)
    .leftJoin(profiles, eq(profiles.id, locationRatings.userId))
    .where(eq(locationRatings.locationId, locationId))
    .orderBy(desc(locationRatings.createdAt))
  return rows.map((r) => ({ rating: r.rating, text: r.text ?? "", username: r.username ?? "Unknown" }))
}

/** Adds a review. Returns false when the location doesn't exist or isn't active. */
export async function addReview(
  review: { locationId: string; userId: string; rating: number; text: string },
  db: Database = getDb(),
): Promise<boolean> {
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, review.locationId), eq(locations.isActive, true)))
  if (!location) return false
  await db.insert(locationRatings).values(review)
  return true
}

/** The user's own reviews, newest first, with the reviewed location's name. */
export async function listUserReviews(userId: string, db: Database = getDb()) {
  const rows = await db
    .select({
      id: locationRatings.id,
      rating: locationRatings.rating,
      text: locationRatings.text,
      createdAt: locationRatings.createdAt,
      name: locations.name,
      retailer: locations.retailer,
      description: locations.description,
    })
    .from(locationRatings)
    .innerJoin(locations, eq(locations.id, locationRatings.locationId))
    .where(eq(locationRatings.userId, userId))
    .orderBy(desc(locationRatings.createdAt))
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.text,
    created: r.createdAt,
    // Imported machines have a retailer but no name.
    location: { name: r.name ?? r.retailer, description: r.description },
  }))
}

/** Updates one of the user's reviews. Returns false when it isn't theirs or doesn't exist. */
export async function updateReview(
  reviewId: string,
  userId: string,
  changes: { rating: number; text: string },
  db: Database = getDb(),
): Promise<boolean> {
  const updated = await db
    .update(locationRatings)
    .set(changes)
    .where(and(eq(locationRatings.id, reviewId), eq(locationRatings.userId, userId)))
    .returning({ id: locationRatings.id })
  return updated.length > 0
}

/** Deletes one of the user's reviews. Returns false when it isn't theirs or doesn't exist. */
export async function deleteReview(reviewId: string, userId: string, db: Database = getDb()): Promise<boolean> {
  const deleted = await db
    .delete(locationRatings)
    .where(and(eq(locationRatings.id, reviewId), eq(locationRatings.userId, userId)))
    .returning({ id: locationRatings.id })
  return deleted.length > 0
}
