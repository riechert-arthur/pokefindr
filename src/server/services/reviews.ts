import "server-only"
import { and, desc, eq, or, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locationRatings, locations, profiles, reviewModerationChecks } from "@/server/db/schema"
import type { ReviewStatus } from "@/lib/reviews/moderation"
import type { ContentModerator, ModerationResult } from "@/server/ports/moderator"
import { moderate, REVIEW_CHECK_TIMEOUT_MS } from "./content-moderation"

/** Reviews everyone may read: held and removed ones are their author's alone (#253). */
const published = eq(locationRatings.status, "published")

export interface LocationReview {
  rating: number
  text: string
  username: string
}

/** Published reviews of one location, newest first. */
export async function listLocationReviews(
  locationId: string,
  db: Database = getDb(),
): Promise<LocationReview[]> {
  const rows = await db
    .select({ rating: locationRatings.rating, text: locationRatings.text, username: profiles.username })
    .from(locationRatings)
    .leftJoin(profiles, eq(profiles.id, locationRatings.userId))
    .where(and(eq(locationRatings.locationId, locationId), published))
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
  /** Always published, except the viewer's own held ("pending review") or removed one. */
  status: ReviewStatus
}

export interface PanelReviews {
  reviews: PanelReview[]
  /** Published reviews only. */
  count: number
  /** Of published reviews; 0 without any. */
  average: number
}

/**
 * A location's reviews for the details panel, newest first, with the
 * viewer's marked. Held and removed reviews are left out, except the
 * viewer's own, so they can see theirs is waiting. With no viewer (the
 * assistant's get_place, MCP) only published ones come back.
 */
export async function getPanelReviews(locationId: string, viewerId: string | null, db: Database = getDb()): Promise<PanelReviews> {
  const rows = await db
    .select({
      id: locationRatings.id,
      rating: locationRatings.rating,
      text: locationRatings.text,
      username: profiles.username,
      createdAt: locationRatings.createdAt,
      mine: viewerId ? sql<boolean>`${locationRatings.userId} = ${viewerId}` : sql<boolean>`false`,
      status: locationRatings.status,
    })
    .from(locationRatings)
    .leftJoin(profiles, eq(profiles.id, locationRatings.userId))
    .where(and(eq(locationRatings.locationId, locationId), viewerId ? or(published, eq(locationRatings.userId, viewerId)) : published))
    .orderBy(desc(locationRatings.createdAt), desc(locationRatings.id))
  const reviews = rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    text: r.text ?? "",
    username: r.username ?? "Unknown",
    createdAt: (r.createdAt ?? new Date(0)).toISOString(),
    mine: Boolean(r.mine),
    status: r.status,
  }))
  const counted = reviews.filter((r) => r.status === "published")
  const average = counted.length ? counted.reduce((n, r) => n + r.rating, 0) / counted.length : 0
  return { reviews, count: counted.length, average }
}

const KIND_NAMES: Record<string, string> = { vending: "vending machine", shop: "card shop", event: "event" }

/** What the moderator is told the review is about. Not the review's own text. */
export function reviewContext(l: { kind: string; name: string | null; retailer: string | null; city: string | null; state: string | null }) {
  const where = [l.city, l.state].filter(Boolean).join(", ")
  return `A review of a ${KIND_NAMES[l.kind] ?? "place"}${l.name || l.retailer ? ` called "${l.name || l.retailer}"` : ""}${where ? ` in ${where}` : ""}.`
}

/**
 * Checks a review's text (#253). Text-free ratings skip it. A failure or a
 * timeout after REVIEW_CHECK_TIMEOUT_MS holds the review: nothing goes up
 * unchecked.
 */
async function checkReview(text: string, context: string, moderator?: ContentModerator): Promise<ModerationResult | null> {
  if (!text.trim()) return null
  return moderate(text, { kind: "review", context, timeoutMs: REVIEW_CHECK_TIMEOUT_MS, fallback: "hold", moderator })
}

/** Stores a check with its review, and logs what it cost (no text). */
export async function recordReviewCheck(ratingId: string, check: ModerationResult, db: Database) {
  await db.insert(reviewModerationChecks).values({
    ratingId,
    verdict: check.verdict,
    categories: check.categories,
    reason: check.reason,
    model: check.model,
    promptVersion: check.promptVersion,
    failed: Boolean(check.failed),
    costMicros: check.usage.costMicros,
  })
  console.info(
    JSON.stringify({
      event: "review_moderation",
      ratingId,
      verdict: check.verdict,
      categories: check.categories,
      failed: Boolean(check.failed),
      model: check.model,
      inputTokens: check.usage.inputTokens,
      outputTokens: check.usage.outputTokens,
      costMicros: check.usage.costMicros,
    }),
  )
}

/** Allowed text is published; anything else waits for a moderator. Blocks too: the row stays so a moderator can reverse it. */
const statusAfter = (check: ModerationResult | null): ReviewStatus => (!check || check.verdict === "allow" ? "published" : "held")

/**
 * Adds a review, after checking its text (#253). Returns its id and status
 * (`held` when it waits for a moderator), or null when the location doesn't
 * exist or isn't active.
 */
export async function addReview(
  review: { locationId: string; userId: string; rating: number; text: string },
  db: Database = getDb(),
  moderator?: ContentModerator,
): Promise<{ id: string; status: ReviewStatus; checkFailed: boolean } | null> {
  const [location] = await db
    .select({ id: locations.id, kind: locations.kind, name: locations.name, retailer: locations.retailer, city: locations.city, state: locations.state })
    .from(locations)
    .where(and(eq(locations.id, review.locationId), eq(locations.isActive, true)))
  if (!location) return null
  // Checked before the insert, so a held review is never visible, not even for a moment.
  const check = await checkReview(review.text, reviewContext(location), moderator)
  const status = statusAfter(check)
  const [added] = await db.insert(locationRatings).values({ ...review, status }).returning({ id: locationRatings.id })
  if (check) await recordReviewCheck(added.id, check, db)
  return { id: added.id, status, checkFailed: Boolean(check?.failed) }
}

/** The user's own reviews, newest first, with the reviewed location's name. */
export async function listUserReviews(userId: string, db: Database = getDb()) {
  const rows = await db
    .select({
      id: locationRatings.id,
      rating: locationRatings.rating,
      text: locationRatings.text,
      createdAt: locationRatings.createdAt,
      status: locationRatings.status,
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
    status: r.status,
    // Imported machines have a retailer but no name.
    location: { id: r.locationId, name: r.name ?? r.retailer, description: r.description, city: r.city, state: r.state },
  }))
}

/**
 * Updates one of the user's reviews, checking the new text again (#253).
 * Returns its status afterwards, or null when it isn't theirs or doesn't
 * exist. A review a moderator removed goes back to the queue whatever the
 * check says, so an edit can't undo a moderator's decision on its own.
 */
export async function updateReview(
  reviewId: string,
  userId: string,
  changes: { rating: number; text: string },
  db: Database = getDb(),
  moderator?: ContentModerator,
): Promise<{ status: ReviewStatus; checkFailed: boolean } | null> {
  const [current] = await db
    .select({ status: locationRatings.status, kind: locations.kind, name: locations.name, retailer: locations.retailer, city: locations.city, state: locations.state })
    .from(locationRatings)
    .innerJoin(locations, eq(locations.id, locationRatings.locationId))
    .where(and(eq(locationRatings.id, reviewId), eq(locationRatings.userId, userId)))
  if (!current) return null
  const check = await checkReview(changes.text, reviewContext(current), moderator)
  const status: ReviewStatus = current.status === "removed" ? "held" : statusAfter(check)
  const updated = await db
    .update(locationRatings)
    // A fresh decision: the last moderator's no longer applies to this text.
    .set({ ...changes, status, moderatedBy: null, moderatedAt: null })
    .where(and(eq(locationRatings.id, reviewId), eq(locationRatings.userId, userId)))
    .returning({ id: locationRatings.id })
  if (updated.length === 0) return null
  if (check) await recordReviewCheck(reviewId, check, db)
  return { status, checkFailed: Boolean(check?.failed) }
}

/** Deletes one of the user's reviews. Returns false when it isn't theirs or doesn't exist. */
export async function deleteReview(reviewId: string, userId: string, db: Database = getDb()): Promise<boolean> {
  const deleted = await db
    .delete(locationRatings)
    .where(and(eq(locationRatings.id, reviewId), eq(locationRatings.userId, userId)))
    .returning({ id: locationRatings.id })
  return deleted.length > 0
}
