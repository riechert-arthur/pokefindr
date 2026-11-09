import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { cardShopDetails, eventDetails, highlights, locationRatings, locationSubmissions, locations, profiles, statusReports } from "@/server/db/schema"
import { canModerate, type Role } from "@/lib/auth/roles"
import type { RejectReason } from "@/lib/submissions/constants"
import type { EventSubmission, ShopSubmission } from "@/lib/submissions/schemas"
import { UNDO_MS, type ModerationCheck, type ModerationItem } from "@/lib/submissions/moderation"
export { UNDO_MS }
import { regionAt } from "@/server/geo/regions"
import { METERS_PER_MILE, pointOf } from "./locations"

/** Moderators see places of the same kind this close as possible duplicates (the prototype's 0.25 mi). */
export const MODERATION_DUPLICATE_MILES = 0.25
const DAY_MS = 24 * 60 * 60 * 1000

export async function getRole(userId: string, db: Database = getDb()): Promise<Role | null> {
  const [row] = await db.select({ role: profiles.role }).from(profiles).where(eq(profiles.id, userId))
  return row?.role ?? null
}

/** Whether this user may review submissions. */
export async function isModerator(userId: string, db: Database = getDb()): Promise<boolean> {
  return canModerate(await getRole(userId, db))
}

type Payload = Partial<Omit<ShopSubmission, "kind" | "lng" | "lat"> & Omit<EventSubmission, "kind" | "lng" | "lat">>

interface Row extends Record<string, unknown> {
  id: string
  kind: "shop" | "event"
  payload: Payload
  lng: number
  lat: number
  status: ModerationItem["status"]
  rejectReason: RejectReason | null
  createdAt: string
  reviewedAt: string | null
  locationId: string | null
  submitterId: string
  submitter: string
  reviewer: string | null
}

const selectItems = sql`
  select s.id, s.kind, s.payload, s.status, s.reject_reason as "rejectReason", s.location_id as "locationId",
    round(ST_X(s.geog::geometry)::numeric, 6)::float8 as lng, round(ST_Y(s.geog::geometry)::numeric, 6)::float8 as lat,
    s.created_at as "createdAt", s.reviewed_at as "reviewedAt",
    s.submitted_by as "submitterId", sp.username as submitter, rp.username as reviewer
  from ${locationSubmissions} s
  join ${profiles} sp on sp.id = s.submitted_by
  left join ${profiles} rp on rp.id = s.reviewed_by`

/**
 * The automatic checks a moderator sees on a submission, as in the
 * prototype: inside a supported country (and the state the pin is in), a
 * possible duplicate within 0.25 mi, and the fields each kind should have.
 */
async function checksFor(row: Row, db: Database, now: Date): Promise<ModerationCheck[]> {
  const p = row.payload
  const region = regionAt(row.lng, row.lat)
  const checks: ModerationCheck[] = [
    {
      key: "country",
      ok: Boolean(region),
      label: region ? `In ${region.name}` : "Outside a supported country",
      detail: region && p.state && p.state.toUpperCase() !== region.region ? `The form says ${p.state}, but the pin is in ${region.region}.` : undefined,
    },
  ]
  const near = await db.execute<{ name: string; meters: number }>(sql`
    select coalesce(l.name, l.retailer, '') as name, round(ST_Distance(l.geog, ${pointOf([row.lng, row.lat])}))::int as meters
    from ${locations} l
    where l.is_active and l.kind = ${row.kind} and l.id is distinct from ${row.locationId}
      and ST_DWithin(l.geog, ${pointOf([row.lng, row.lat])}, ${MODERATION_DUPLICATE_MILES * METERS_PER_MILE})
    order by meters limit 3`)
  checks.push({
    key: "duplicate",
    ok: near.length === 0,
    label: near.length ? "Possible duplicate" : "No duplicate nearby",
    detail: near.length ? near.map((n) => `${n.name || "A place"} (${n.meters} m)`).join(", ") : undefined,
  })
  if (row.kind === "shop") {
    checks.push({ key: "address", ok: Boolean(p.address), label: p.address ? "Has a street address" : "No street address" })
    checks.push({ key: "website", ok: Boolean(p.website), label: p.website ? "Has a website" : "No website" })
  } else {
    const starts = p.startsAt ? Date.parse(p.startsAt) : NaN
    const ok = Number.isFinite(starts) && starts > now.getTime() - DAY_MS
    checks.push({ key: "date", ok, label: !p.startsAt ? "No date" : ok ? "Has a date" : "The date has passed" })
  }
  return checks
}

async function toItems(rows: Row[], db: Database, now: Date): Promise<ModerationItem[]> {
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      rejectReason: r.rejectReason,
      fields: r.payload,
      lng: r.lng,
      lat: r.lat,
      submittedBy: r.submitter,
      reviewedBy: r.reviewer,
      createdAt: new Date(r.createdAt).toISOString(),
      reviewedAt: r.reviewedAt && new Date(r.reviewedAt).toISOString(),
      locationId: r.locationId,
      checks: r.status === "pending" ? await checksFor(r, db, now) : [],
    })),
  )
}

/** Pending submissions, oldest first: the review queue. */
export async function listQueue(db: Database = getDb(), now = new Date(), limit = 100): Promise<ModerationItem[]> {
  const rows = await db.execute<Row>(sql`${selectItems} where s.status = 'pending' order by s.created_at, s.id limit ${limit}`)
  return toItems([...rows], db, now)
}

/** What this moderator decided in the last day, newest first: the "Decided" list, with Undo while it's allowed. */
export async function listDecided(reviewerId: string, db: Database = getDb(), now = new Date(), limit = 50): Promise<ModerationItem[]> {
  const rows = await db.execute<Row>(sql`
    ${selectItems}
    where s.status <> 'pending' and s.reviewed_by = ${reviewerId} and s.reviewed_at > ${new Date(now.getTime() - DAY_MS).toISOString()}::timestamptz
    order by s.reviewed_at desc, s.id limit ${limit}`)
  return toItems([...rows], db, now)
}

export type DecisionResult = { status: "done"; locationId?: string } | { status: "not_found" } | { status: "not_pending" } | { status: "too_late" } | { status: "in_use" }

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0]

/** Locks the submission for this decision. */
async function lockSubmission(tx: Tx, id: string) {
  const [row] = await tx.select().from(locationSubmissions).where(eq(locationSubmissions.id, id)).for("update")
  return row
}

/**
 * Approves a pending submission: in one transaction, creates the location
 * (active, so everyone sees it on the map), its details row, and marks the
 * submission approved with the new location's id.
 */
export async function approveSubmission(id: string, reviewerId: string, db: Database = getDb(), now = new Date()): Promise<DecisionResult> {
  return db.transaction(async (tx): Promise<DecisionResult> => {
    const sub = await lockSubmission(tx, id)
    if (!sub) return { status: "not_found" }
    if (sub.status !== "pending") return { status: "not_pending" }
    const p = sub.payload as Payload
    const region = regionAt(sub.geog.lng, sub.geog.lat)
    const [location] = await tx
      .insert(locations)
      .values({
        kind: sub.kind,
        name: p.name,
        address: p.address ?? null,
        city: p.city ?? null,
        // The state the pin is in wins over what was typed.
        state: region?.region ?? p.state ?? null,
        countryCode: region?.country ?? p.countryCode ?? "US",
        geog: sub.geog,
        source: "submission",
        createdBy: sub.submittedBy,
        isActive: true,
      })
      .returning({ id: locations.id })
    if (sub.kind === "shop") {
      await tx.insert(cardShopDetails).values({ locationId: location.id, website: p.website ?? null, hours: p.hours ?? null, sells: p.sells ?? [] })
    } else {
      await tx.insert(eventDetails).values({
        locationId: location.id,
        startsAt: new Date(p.startsAt!),
        endsAt: p.endsAt ? new Date(p.endsAt) : null,
        venue: p.venue ?? null,
        link: p.link ?? null,
        isFree: p.isFree ?? null,
      })
    }
    await tx
      .update(locationSubmissions)
      .set({ status: "approved", locationId: location.id, reviewedBy: reviewerId, reviewedAt: now, rejectReason: null })
      .where(eq(locationSubmissions.id, id))
    return { status: "done", locationId: location.id }
  })
}

/** Rejects a pending submission with a reason the submitter sees. Nothing goes on the map. */
export async function rejectSubmission(id: string, reviewerId: string, reason: RejectReason, db: Database = getDb(), now = new Date()): Promise<DecisionResult> {
  return db.transaction(async (tx): Promise<DecisionResult> => {
    const sub = await lockSubmission(tx, id)
    if (!sub) return { status: "not_found" }
    if (sub.status !== "pending") return { status: "not_pending" }
    await tx.update(locationSubmissions).set({ status: "rejected", rejectReason: reason, reviewedBy: reviewerId, reviewedAt: now }).where(eq(locationSubmissions.id, id))
    return { status: "done" }
  })
}

/**
 * Puts a decision back to pending, for the moderator who made it, within an
 * hour: an approval's location (and its details) is deleted again. Not once
 * people have rated, reported or featured the place: deleting it would take
 * their posts with it (`in_use`). The location row is locked first, so none
 * can be added while this runs.
 */
export async function undoDecision(id: string, reviewerId: string, db: Database = getDb(), now = new Date()): Promise<DecisionResult> {
  return db.transaction(async (tx): Promise<DecisionResult> => {
    const sub = await lockSubmission(tx, id)
    if (!sub) return { status: "not_found" }
    if (sub.status === "pending") return { status: "not_pending" }
    if (sub.reviewedBy !== reviewerId || !sub.reviewedAt || now.getTime() - sub.reviewedAt.getTime() > UNDO_MS) return { status: "too_late" }
    const locationId = sub.status === "approved" ? sub.locationId : null
    if (locationId) {
      await tx.select({ id: locations.id }).from(locations).where(eq(locations.id, locationId)).for("update")
      const [{ used }] = await tx.execute<{ used: boolean }>(sql`
        select exists (select 1 from ${locationRatings} where location_id = ${locationId})
          or exists (select 1 from ${statusReports} where location_id = ${locationId})
          or exists (select 1 from ${highlights} where location_id = ${locationId}) as used`)
      if (used) return { status: "in_use" }
    }
    await tx
      .update(locationSubmissions)
      .set({ status: "pending", rejectReason: null, reviewedBy: null, reviewedAt: null, locationId: null })
      .where(eq(locationSubmissions.id, id))
    if (locationId) await tx.delete(locations).where(and(eq(locations.id, locationId), eq(locations.source, "submission")))
    return { status: "done" }
  })
}
