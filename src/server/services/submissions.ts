import "server-only"
import { eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locationSubmissions, locations } from "@/server/db/schema"
import type { SubmissionKind } from "@/lib/submissions/constants"
import type { DuplicateCandidate, MySubmission, SubmissionInput } from "@/lib/submissions/schemas"
import { pointOf } from "./locations"
import type { SubmissionTextCheck } from "@/lib/reviews/moderation"
import type { ContentModerator } from "@/server/ports/moderator"
import { moderate, REVIEW_CHECK_TIMEOUT_MS } from "./content-moderation"
import { logError } from "@/server/log"

/** Submissions one person may send in a day: enough for a few real places, too few to flood the queue. */
export const SUBMISSIONS_PER_DAY = 5
/** Places of the same kind this close (meters) may be the same place. */
export const DUPLICATE_METERS = 150
const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Active locations of this kind within DUPLICATE_METERS of the point, and the
 * person's own pending submissions there, nearest first. Other people's
 * pending submissions aren't shown: they aren't public yet.
 */
export async function findDuplicates(
  { kind, lng, lat, userId }: { kind: SubmissionKind; lng: number; lat: number; userId: string },
  db: Pick<Database, "execute"> = getDb(),
  meters = DUPLICATE_METERS,
): Promise<DuplicateCandidate[]> {
  const point = pointOf([lng, lat])
  const rows = await db.execute<DuplicateCandidate>(sql`
    select * from (
      select l.id, coalesce(l.name, l.retailer, '') as name, 'location' as source,
        coalesce(l.address, '') as address, coalesce(l.city, '') as city, coalesce(l.state, '') as state,
        round(ST_Distance(l.geog, ${point}))::int as meters
      from ${locations} l
      where l.is_active and l.kind = ${kind} and ST_DWithin(l.geog, ${point}, ${meters})
      union all
      select s.id, coalesce(s.payload->>'name', ''), 'submission',
        coalesce(s.payload->>'address', ''), coalesce(s.payload->>'city', ''), coalesce(s.payload->>'state', ''),
        round(ST_Distance(s.geog, ${point}))::int
      from ${locationSubmissions} s
      where s.status = 'pending' and s.kind = ${kind} and s.submitted_by = ${userId}
        and ST_DWithin(s.geog, ${point}, ${meters})
    ) near
    order by meters, id
    limit 5
  `)
  return [...rows]
}

export type CreateResult =
  | { status: "created"; id: string }
  | { status: "duplicate"; duplicates: DuplicateCandidate[] }
  | { status: "rate_limited" }

/**
 * Stores a submission for review. Places of the same kind within 150 m come
 * back as `duplicate` unless `confirmDuplicate` says the person checked them.
 * Past SUBMISSIONS_PER_DAY in 24 hours it's `rate_limited`.
 */
export async function createSubmission(
  { userId, input, confirmDuplicate = false }: { userId: string; input: SubmissionInput; confirmDuplicate?: boolean },
  db: Database = getDb(),
  now = new Date(),
  moderator?: ContentModerator,
): Promise<CreateResult> {
  const result = await insertSubmission({ userId, input, confirmDuplicate }, db, now)
  // After the insert's transaction, so the check never holds a lock. It never rejects anything: moderators decide.
  if (result.status === "created") await checkSubmissionText(result.id, input, db, moderator)
  return result
}

/** The fields people type freely, as the text check reads them. */
export function submissionText(input: Partial<SubmissionInput>): string {
  const f = input as Record<string, unknown>
  return (
    [
      ["Name", f.name],
      ["Venue", f.venue],
      ["Hours", f.hours],
      ["Website", f.website],
      ["Link", f.link],
    ] as const
  )
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")
}

/**
 * Checks a submission's free text (#253) and stores the result on it, for
 * the review queue's checks. A failure is stored as a failed check; it
 * never blocks the submission.
 */
export async function checkSubmissionText(id: string, input: Partial<SubmissionInput>, db: Database = getDb(), moderator?: ContentModerator) {
  const text = submissionText(input)
  if (!text) return
  try {
    const check = await moderate(text, { kind: "submission", timeoutMs: REVIEW_CHECK_TIMEOUT_MS, fallback: "hold", moderator })
    const stored: SubmissionTextCheck = {
      verdict: check.verdict,
      categories: check.categories,
      reason: check.reason,
      model: check.model,
      failed: Boolean(check.failed),
      at: new Date().toISOString(),
    }
    await db.update(locationSubmissions).set({ textCheck: stored }).where(eq(locationSubmissions.id, id))
    console.info(JSON.stringify({ event: "submission_moderation", submissionId: id, verdict: check.verdict, failed: stored.failed, costMicros: check.usage.costMicros }))
  } catch (err) {
    logError("moderation.store_failed", err, { kind: "submission" })
  }
}

async function insertSubmission(
  { userId, input, confirmDuplicate }: { userId: string; input: SubmissionInput; confirmDuplicate: boolean },
  db: Database,
  now: Date,
): Promise<CreateResult> {
  const { kind, lng, lat, ...fields } = input
  // One person's submissions are counted and added one at a time, so parallel requests can't all pass the limit.
  return db.transaction(async (tx): Promise<CreateResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"location_submissions:" + userId}))`)
    const [{ today }] = await tx.execute<{ today: number }>(sql`
      select count(*)::int as today from ${locationSubmissions}
      where submitted_by = ${userId} and created_at > ${new Date(now.getTime() - DAY_MS).toISOString()}::timestamptz`)
    if (today >= SUBMISSIONS_PER_DAY) return { status: "rate_limited" }
    if (!confirmDuplicate) {
      const duplicates = await findDuplicates({ kind, lng, lat, userId }, tx)
      if (duplicates.length) return { status: "duplicate", duplicates }
    }
    const [row] = await tx
      .insert(locationSubmissions)
      .values({ kind, payload: fields, geog: { lng, lat }, submittedBy: userId, createdAt: now })
      .returning({ id: locationSubmissions.id })
    return { status: "created", id: row.id }
  })
}

/** The person's submissions, newest first, with what became of each. */
export async function listMySubmissions(userId: string, db: Database = getDb(), limit = 50): Promise<MySubmission[]> {
  const rows = await db.execute<MySubmission>(sql`
    select s.id, s.kind, s.status, s.reject_reason as "rejectReason",
      coalesce(s.payload->>'name', '') as name, coalesce(s.payload->>'address', '') as address,
      coalesce(s.payload->>'city', '') as city, coalesce(s.payload->>'state', '') as state,
      round(ST_X(s.geog::geometry)::numeric, 5)::float8 as lng, round(ST_Y(s.geog::geometry)::numeric, 5)::float8 as lat,
      s.payload->>'startsAt' as "startsAt", s.location_id as "locationId", l.is_active as "locationActive",
      s.created_at as "createdAt", s.reviewed_at as "reviewedAt"
    from ${locationSubmissions} s
    left join ${locations} l on l.id = s.location_id
    where s.submitted_by = ${userId}
    order by s.created_at desc, s.id
    limit ${limit}
  `)
  return rows.map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
    reviewedAt: r.reviewedAt && new Date(r.reviewedAt).toISOString(),
  }))
}
