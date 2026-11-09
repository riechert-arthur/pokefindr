import "server-only"
import { and, desc, eq, isNotNull, isNull, ne, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locations, profiles, reportActions, statusReports } from "@/server/db/schema"
import { RESOLUTION_OF, type ReportAction, type ReportReason, type ReportResolution } from "@/lib/locations/reports"
import type { ReportedLocation } from "@/lib/admin/reports"

const DAY_MS = 24 * 60 * 60 * 1000
/** Resolved locations stay listed this long, so a mistake can be reopened. */
export const RESOLVED_LISTED_DAYS = 30

/**
 * The reports page (#153): each reported location once, with its open
 * reports' count and most common reason, the last report, and what was
 * done. Open ones first, most reported first; then the ones resolved in the
 * last 30 days, newest first.
 */
export async function listReportedLocations(db: Database = getDb(), now = new Date()): Promise<ReportedLocation[]> {
  const since = new Date(now.getTime() - RESOLVED_LISTED_DAYS * DAY_MS)
  const rows = await db.execute<{
    id: string
    name: string
    address: string | null
    city: string | null
    state: string | null
    machineId: string | null
    kind: string
    hidden: boolean
    open: number
    total: number
    reason: ReportReason | null
    lastReportAt: string
    action: ReportAction | null
    actedAt: string | null
    actedBy: string | null
  }>(sql`
    with r as (
      select location_id, count(*) filter (where resolved_at is null)::int as open, count(*)::int as total, max(created_at) as last_report_at
      from ${statusReports}
      where reason is not null and (resolved_at is null or resolved_at > ${since.toISOString()}::timestamptz)
      group by location_id
    )
    select l.id, coalesce(l.retailer, l.name, '') as name, l.address, l.city, l.state, l."machineID" as "machineId", l.kind,
      l.hidden_at is not null as hidden, r.open, r.total, r.last_report_at as "lastReportAt",
      (select s.reason from ${statusReports} s
        where s.location_id = l.id and s.reason is not null and (r.open = 0 or s.resolved_at is null)
        group by s.reason order by count(*) desc, max(s.created_at) desc limit 1) as reason,
      a.action, a.created_at as "actedAt", p.username as "actedBy"
    from r
    join ${locations} l on l.id = r.location_id
    left join lateral (
      select action, created_at, acted_by from ${reportActions} where location_id = l.id order by created_at desc limit 1
    ) a on true
    left join ${profiles} p on p.id = a.acted_by
    order by (r.open > 0) desc, r.open desc, r.last_report_at desc
    limit 200
  `)
  return rows.map((r) => ({
    location: { id: r.id, name: r.name, address: r.address ?? "", city: r.city ?? "", state: r.state ?? "", machineId: r.machineId, kind: r.kind, hidden: r.hidden },
    open: r.open,
    total: r.total,
    reason: r.reason,
    lastReportAt: new Date(r.lastReportAt).toISOString(),
    status: r.open > 0 ? "open" : r.action && r.action !== "reopen" ? RESOLUTION_OF[r.action] : "open",
    lastAction: r.action ? { action: r.action, at: new Date(r.actedAt!).toISOString(), by: r.actedBy ?? "Unknown" } : null,
  }))
}

export type ActResult = { status: "done"; reports: number } | { status: "not_found" } | { status: "nothing_open" } | { status: "nothing_to_reopen" }

/**
 * Acts on a location's reports (#153), in one transaction with the location
 * locked, and records it in report_actions:
 * - dismiss, fix: closes its open reports.
 * - hide: also takes the location off the map (is_active false, hidden_at).
 * - reopen: undoes the last dismiss, fix or hide: those reports open again,
 *   and a hidden location comes back.
 */
export async function actOnReports(locationId: string, action: ReportAction, actorId: string, db: Database = getDb(), now = new Date()): Promise<ActResult> {
  return db.transaction(async (tx): Promise<ActResult> => {
    const [location] = await tx.select({ id: locations.id, hiddenAt: locations.hiddenAt }).from(locations).where(eq(locations.id, locationId)).for("update")
    if (!location) return { status: "not_found" }

    if (action === "reopen") {
      const [last] = await tx
        .select({ action: reportActions.action, at: reportActions.createdAt })
        .from(reportActions)
        .where(and(eq(reportActions.locationId, locationId), ne(reportActions.action, "reopen")))
        .orderBy(desc(reportActions.createdAt))
        .limit(1)
      const [lastReopen] = await tx
        .select({ at: reportActions.createdAt })
        .from(reportActions)
        .where(and(eq(reportActions.locationId, locationId), eq(reportActions.action, "reopen")))
        .orderBy(desc(reportActions.createdAt))
        .limit(1)
      // Nothing done yet, or the last thing done was already reopened.
      if (!last || (lastReopen && lastReopen.at >= last.at)) return { status: "nothing_to_reopen" }
      // The reports that action closed: resolved at the same moment, in the same transaction.
      const reopened = await tx
        .update(statusReports)
        .set({ resolvedAt: null, resolvedBy: null, resolution: null })
        .where(and(eq(statusReports.locationId, locationId), eq(statusReports.resolvedAt, last.at)))
        .returning({ id: statusReports.id })
      if (last.action === "hide" && location.hiddenAt) {
        await tx.update(locations).set({ isActive: true, hiddenAt: null, hiddenBy: null, updatedAt: now }).where(eq(locations.id, locationId))
      }
      await tx.insert(reportActions).values({ locationId, action, actedBy: actorId, reports: reopened.length, createdAt: now })
      return { status: "done", reports: reopened.length }
    }

    const resolution: ReportResolution = RESOLUTION_OF[action]
    const closed = await tx
      .update(statusReports)
      .set({ resolvedAt: now, resolvedBy: actorId, resolution })
      .where(and(eq(statusReports.locationId, locationId), isNull(statusReports.resolvedAt), isNotNull(statusReports.reason)))
      .returning({ id: statusReports.id })
    if (closed.length === 0) return { status: "nothing_open" }
    if (action === "hide") {
      await tx.update(locations).set({ isActive: false, hiddenAt: now, hiddenBy: actorId, updatedAt: now }).where(eq(locations.id, locationId))
    }
    await tx.insert(reportActions).values({ locationId, action, actedBy: actorId, reports: closed.length, createdAt: now })
    return { status: "done", reports: closed.length }
  })
}

/** Open reports and the locations they're on, for the sidebar and the summary card. */
export async function openReportCounts(db: Database = getDb()): Promise<{ locations: number; reports: number; maxOnOne: number }> {
  const [r] = await db.execute<{ locations: number; reports: number; maxOnOne: number }>(sql`
    select count(*)::int as locations, coalesce(sum(n), 0)::int as reports, coalesce(max(n), 0)::int as "maxOnOne"
    from (select count(*) as n from ${statusReports} where resolved_at is null and reason is not null group by location_id) per
  `)
  return r
}
