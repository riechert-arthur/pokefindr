import "server-only"
import { eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locationRatings, locations, profiles, reviewModerationChecks } from "@/server/db/schema"
import { can } from "@/lib/auth/entitlements"
import { UNDO_MS } from "@/lib/submissions/moderation"
import type { HeldReview, ModerationCategory, ModerationVerdict, ReviewStatus } from "@/lib/reviews/moderation"
import type { ContentModerator } from "@/server/ports/moderator"
import { enqueueJob } from "@/server/lib/jobs/enqueue"
import { moderate } from "./content-moderation"
import { recordReviewCheck, reviewContext } from "./reviews"

const DAY_MS = 24 * 60 * 60 * 1000

interface Row extends Record<string, unknown> {
  id: string
  rating: number
  text: string | null
  status: ReviewStatus
  authorId: string
  author: string | null
  createdAt: string
  locationId: string
  locationName: string
  city: string | null
  state: string | null
  kind: string
  verdict: ModerationVerdict | null
  categories: ModerationCategory[] | null
  reason: string | null
  model: string | null
  failed: boolean | null
  checkedAt: string | null
  moderator: string | null
  moderatedAt: string | null
}

/** Each review with its author, place and latest check. */
const selectReviews = sql`
  select r.id, r.rating, r.text, r.status, r.user_id as "authorId", a.username as author, r.created_at as "createdAt",
    l.id as "locationId", coalesce(l.name, l.retailer, '') as "locationName", l.city, l.state, l.kind,
    c.verdict, c.categories, c.reason, c.model, c.failed, c.created_at as "checkedAt",
    m.username as moderator, r.moderated_at as "moderatedAt"
  from ${locationRatings} r
  join ${locations} l on l.id = r.location_id
  left join ${profiles} a on a.id = r.user_id
  left join ${profiles} m on m.id = r.moderated_by
  left join lateral (
    select verdict, categories, reason, model, failed, created_at from ${reviewModerationChecks}
    where rating_id = r.id order by created_at desc limit 1
  ) c on true`

const toItem =
  (viewerId: string) =>
  (r: Row): HeldReview => ({
    id: r.id,
    rating: r.rating,
    text: r.text ?? "",
    status: r.status,
    author: r.author ?? "Unknown",
    writtenByViewer: r.authorId === viewerId,
    createdAt: new Date(r.createdAt).toISOString(),
    location: { id: r.locationId, name: r.locationName, city: r.city ?? "", state: r.state ?? "", kind: r.kind },
    check: r.verdict
      ? { verdict: r.verdict, categories: r.categories ?? [], reason: r.reason ?? "", model: r.model ?? "", failed: Boolean(r.failed), at: new Date(r.checkedAt!).toISOString() }
      : null,
    moderatedBy: r.moderator,
    moderatedAt: r.moderatedAt && new Date(r.moderatedAt).toISOString(),
  })

/** Held reviews, oldest first: the Reviews tab (#253). */
export async function listHeldReviews(viewerId: string, db: Database = getDb(), limit = 100): Promise<HeldReview[]> {
  const rows = await db.execute<Row>(sql`${selectReviews} where r.status = 'held' order by r.created_at, r.id limit ${limit}`)
  return [...rows].map(toItem(viewerId))
}

/** What this moderator approved or removed in the last day, newest first, with Undo while it's allowed. */
export async function listDecidedReviews(moderatorId: string, db: Database = getDb(), now = new Date(), limit = 50): Promise<HeldReview[]> {
  const rows = await db.execute<Row>(sql`
    ${selectReviews}
    where r.status <> 'held' and r.moderated_by = ${moderatorId} and r.moderated_at > ${new Date(now.getTime() - DAY_MS).toISOString()}::timestamptz
    order by r.moderated_at desc, r.id limit ${limit}`)
  return [...rows].map(toItem(moderatorId))
}

/** Held reviews, for the sidebar count. */
export async function heldReviewCount(db: Database = getDb()): Promise<number> {
  const [{ n }] = await db.execute<{ n: number }>(sql`select count(*)::int as n from ${locationRatings} where status = 'held'`)
  return n
}

export type ReviewAction = "approve" | "remove" | "undo"
export type ReviewDecision = { status: "done"; review: ReviewStatus } | { status: "not_found" } | { status: "not_held" } | { status: "too_late" } | { status: "own" }

/**
 * A moderator's decision on a held review, in one transaction with the
 * review locked: approve publishes it, remove keeps it from everyone but
 * its author. Undo puts the moderator's own decision from the last hour
 * back in the queue, as with submissions. Deciding a review you wrote needs
 * `moderation.decideOwn` (admins).
 */
export async function decideReview(id: string, action: ReviewAction, moderatorId: string, db: Database = getDb(), now = new Date()): Promise<ReviewDecision> {
  return db.transaction(async (tx): Promise<ReviewDecision> => {
    const [row] = await tx
      .select({ status: locationRatings.status, userId: locationRatings.userId, moderatedBy: locationRatings.moderatedBy, moderatedAt: locationRatings.moderatedAt })
      .from(locationRatings)
      .where(eq(locationRatings.id, id))
      .for("update")
    if (!row) return { status: "not_found" }
    if (action === "undo") {
      if (row.status === "held") return { status: "not_held" }
      if (row.moderatedBy !== moderatorId || !row.moderatedAt || now.getTime() - row.moderatedAt.getTime() > UNDO_MS) return { status: "too_late" }
      // Who decided stays: the recheck job leaves a review a moderator has seen to a moderator.
      await tx.update(locationRatings).set({ status: "held" }).where(eq(locationRatings.id, id))
      return { status: "done", review: "held" }
    }
    if (row.status !== "held") return { status: "not_held" }
    if (row.userId === moderatorId) {
      const [me] = await tx.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, moderatorId))
      if (!can(me?.role, "moderation.decideOwn")) return { status: "own" }
    }
    const status: ReviewStatus = action === "approve" ? "published" : "removed"
    await tx.update(locationRatings).set({ status, moderatedBy: moderatorId, moderatedAt: now }).where(eq(locationRatings.id, id))
    return { status: "done", review: status }
  })
}

/** A recheck gets longer than a first check: nobody is waiting on it. */
export const RECHECK_TIMEOUT_MS = 10_000

/**
 * Checks again the held reviews whose last check failed (an outage or a
 * timeout) and that no moderator has decided: allowed ones are published,
 * others stay held with the new reason. A review edited meanwhile is
 * skipped; its edit was checked on its own.
 */
export async function recheckFailedReviews(db: Database = getDb(), moderator?: ContentModerator, limit = 50) {
  const rows = await db.execute<{ id: string; text: string; kind: string; name: string | null; retailer: string | null; city: string | null; state: string | null }>(sql`
    select r.id, r.text, l.kind, l.name, l.retailer, l.city, l.state
    from ${locationRatings} r
    join ${locations} l on l.id = r.location_id
    join lateral (select failed from ${reviewModerationChecks} where rating_id = r.id order by created_at desc limit 1) c on true
    where r.status = 'held' and r.moderated_at is null and c.failed and coalesce(r.text, '') <> ''
    order by r.created_at limit ${limit}`)
  let published = 0
  let failed = 0
  for (const r of rows) {
    const check = await moderate(r.text, { kind: "review", context: reviewContext(r), timeoutMs: RECHECK_TIMEOUT_MS, fallback: "hold", moderator })
    if (check.failed) {
      // Still down: try the rest next time instead of piling up failed checks.
      failed++
      break
    }
    // Locked, and only for the text that was checked: an edit meanwhile has its own check, and a moderator's decision wins.
    published += await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ status: locationRatings.status, text: locationRatings.text, moderatedAt: locationRatings.moderatedAt })
        .from(locationRatings)
        .where(eq(locationRatings.id, r.id))
        .for("update")
      if (!row || row.status !== "held" || row.text !== r.text || row.moderatedAt) return 0
      await recordReviewCheck(r.id, check, tx)
      if (check.verdict !== "allow") return 0
      await tx.update(locationRatings).set({ status: "published" }).where(eq(locationRatings.id, r.id))
      return 1
    })
  }
  // Still down, or more than one run's worth: run again soon rather than waiting for the daily cron.
  return { found: rows.length, published, stillFailing: failed, again: failed > 0 || rows.length === limit }
}

/** How long after a failed check the recheck runs. */
export const RECHECK_DELAY_SECONDS = 600

/**
 * A failed check held a review: check it again in a few minutes. One run
 * per ten-minute window covers every review that failed in it (on Vercel;
 * elsewhere each failure starts its own timer).
 */
export function recheckSoon(now = Date.now()) {
  const window = Math.floor(now / (RECHECK_DELAY_SECONDS * 1000))
  enqueueJob("recheck-held-reviews", {}, { delaySeconds: RECHECK_DELAY_SECONDS, idempotencyKey: `recheck-held-reviews:${window}` }).catch((err) =>
    console.error("[reviews] couldn't queue the recheck", err),
  )
}

