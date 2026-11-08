import "server-only"
import { and, desc, eq, gt, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations, profiles, statusReports } from "@/server/db/schema"
import type { ReportReason } from "@/lib/locations/reports"

/** Reports one user may send in a day: plenty for real problems, few enough to stop a flood. */
export const REPORTS_PER_DAY = 10
const DAY_MS = 24 * 60 * 60 * 1000

export type ReportResult = "added" | "duplicate" | "not_found" | "rate_limited"

/**
 * Stores a "Report a problem" for an active location. The same user
 * reporting the same location again within a day is a duplicate (not
 * stored again); past REPORTS_PER_DAY in a day they're rate limited.
 */
export async function addLocationReport(
  report: { locationId: string; userId: string; reason: ReportReason; comment?: string | null },
  db: Database = getDb(),
  now = new Date(),
): Promise<ReportResult> {
  const since = new Date(now.getTime() - DAY_MS)
  const [location] = await db
    .select({ id: locations.id })
    .from(locations)
    .where(and(eq(locations.id, report.locationId), eq(locations.isActive, true)))
  if (!location) return "not_found"
  // One user's reports are counted and added one at a time, so parallel
  // requests can't all pass the duplicate check and the daily limit.
  return db.transaction(async (tx): Promise<ReportResult> => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"status_reports:" + report.userId}))`)
    const [{ today, here }] = await tx
      .select({
        today: sql<number>`count(*)::int`,
        here: sql<number>`(count(*) filter (where ${statusReports.locationId} = ${report.locationId}))::int`,
      })
      .from(statusReports)
      .where(and(eq(statusReports.userId, report.userId), gt(statusReports.createdAt, since)))
    if (here > 0) return "duplicate"
    if (today >= REPORTS_PER_DAY) return "rate_limited"
    await tx.insert(statusReports).values({
      locationId: report.locationId,
      userId: report.userId,
      reason: report.reason,
      comment: report.comment?.trim() || null,
      createdAt: now,
    })
    return "added"
  })
}

export interface LocationReport {
  id: string
  reason: ReportReason | null
  comment: string | null
  createdAt: string
  username: string
  location: { id: string; name: string; city: string; state: string; isActive: boolean }
  /** Reports of this location in the list's window, this one included. */
  reportsForLocation: number
}

/**
 * Recent problem reports, newest first, with who sent them and the
 * location: what the admin reports page (#153) lists and acts on.
 */
export async function listRecentReports({ days = 30, limit = 100 }: { days?: number; limit?: number } = {}, db: Database = getDb(), now = new Date()): Promise<LocationReport[]> {
  const since = new Date(now.getTime() - days * DAY_MS)
  const rows = await db
    .select({
      id: statusReports.id,
      reason: statusReports.reason,
      comment: statusReports.comment,
      createdAt: statusReports.createdAt,
      username: profiles.username,
      locationId: locations.id,
      name: sql<string>`coalesce(${locations.retailer}, ${locations.name}, '')`,
      city: locations.city,
      state: locations.state,
      isActive: locations.isActive,
      reportsForLocation: sql<number>`(count(*) over (partition by ${statusReports.locationId}))::int`,
    })
    .from(statusReports)
    .innerJoin(locations, eq(locations.id, statusReports.locationId))
    .leftJoin(profiles, eq(profiles.id, statusReports.userId))
    .where(and(gt(statusReports.createdAt, since), sql`${statusReports.reason} is not null`))
    .orderBy(desc(statusReports.createdAt), desc(statusReports.id))
    .limit(limit)
  return rows.map((r) => ({
    id: r.id,
    reason: r.reason,
    comment: r.comment,
    createdAt: (r.createdAt ?? new Date(0)).toISOString(),
    username: r.username ?? "Unknown",
    location: { id: r.locationId, name: r.name, city: r.city ?? "", state: r.state ?? "", isActive: r.isActive },
    reportsForLocation: r.reportsForLocation,
  }))
}
