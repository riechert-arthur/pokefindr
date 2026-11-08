import "server-only"
import { and, desc, eq, sql } from "drizzle-orm"
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

/** One review in the details panel; `mine` marks the viewer's own, which they can edit. */
export interface PanelReview {
  id: string
  rating: number
  text: string
  username: string
  createdAt: string
  mine: boolean
}

export interface PanelReviews {
  reviews: PanelReview[]
  count: number
  /** 0 without reviews. */
  average: number
}

/** A location's reviews for the details panel, newest first, with the viewer's marked. */
export async function getPanelReviews(locationId: string, viewerId: string | null, db: Database = getDb()): Promise<PanelReviews> {
  const rows = await db
    .select({
      id: locationRatings.id,
      rating: locationRatings.rating,
      text: locationRatings.text,
      username: profiles.username,
      createdAt: locationRatings.createdAt,
      mine: viewerId ? sql<boolean>`${locationRatings.userId} = ${viewerId}` : sql<boolean>`false`,
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
    createdAt: (r.createdAt ?? new Date(0)).toISOString(),
    mine: Boolean(r.mine),
  }))
  const average = reviews.length ? reviews.reduce((n, r) => n + r.rating, 0) / reviews.length : 0
  return { reviews, count: reviews.length, average }
}

/** Adds a review. Returns its id, or null when the location doesn't exist or isn't active. */
export async function addReview(
  review: { locationId: string; userId: string; rating: number; text: string },
  db: Database = getDb(),
): Promise<string | null> {
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, review.locationId), eq(locations.isActive, true)))
  if (!location) return null
  const [added] = await db.insert(locationRatings).values(review).returning({ id: locationRatings.id })
  return added.id
}

/** The user's own reviews, newest first, with the reviewed location's name. */
export async function listUserReviews(userId: string, db: Database = getDb()) {
  const rows = await db
    .select({
      id: locationRatings.id,
      rating: locationRatings.rating,
      text: locationRatings.text,
      createdAt: locationRatings.createdAt,
      locationId: locations.id,
      name: locations.name,
      retailer: locations.retailer,
      description: locations.description,
      city: locations.city,
      state: locations.state,
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
    location: { id: r.locationId, name: r.name ?? r.retailer, description: r.description, city: r.city, state: r.state },
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
