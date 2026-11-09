import "server-only"
import { and, eq, isNotNull, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locationSubmissions, locations } from "@/server/db/schema"
import { listJobs } from "@/server/services/admin-jobs"
import type { LocationKind } from "@/lib/types/locations"
import type { AdminSummary } from "@/lib/admin/summary"
import type { StaffRole } from "@/lib/admin/roles"
import { openReportCounts } from "@/server/services/report-admin"

/**
 * The admin's counts (#152, #158), in one round trip per part. Moderators
 * get only the Moderation counts: live locations and the sync job are
 * admin data.
 */
export async function getAdminSummary(role: StaffRole, db: Database = getDb()): Promise<AdminSummary> {
  const admin = role === "admin"
  const [[queue], reports, live, jobs] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int`, oldestAt: sql<string | null>`min(${locationSubmissions.createdAt})` })
      .from(locationSubmissions)
      .where(eq(locationSubmissions.status, "pending")),
    openReportCounts(db),
    // Counted live, not from the region counts view, so a hide or an add shows at once.
    admin
      ? db
          .select({ kind: locations.kind, count: sql<number>`count(*)::int` })
          .from(locations)
          .where(and(eq(locations.isActive, true), isNotNull(locations.geog)))
          .groupBy(locations.kind)
      : null,
    admin ? listJobs(db) : null,
  ])
  const counts = {
    queue: { count: queue.count, oldestAt: queue.oldestAt ? new Date(queue.oldestAt).toISOString() : null },
    reports,
  }
  if (!live || !jobs) return counts
  const byKind: Partial<Record<LocationKind, number>> = Object.fromEntries(live.map((r) => [r.kind, r.count]))
  const sync = jobs.find((j) => j.name === "location-sync")
  return {
    ...counts,
    live: { total: live.reduce((n, r) => n + r.count, 0), byKind },
    sync: sync?.paused
      ? { status: "paused", detail: sync.paused, at: null }
      : sync?.lastRun
        ? { status: sync.lastRun.status, detail: sync.lastRun.error, at: sync.lastRun.startedAt }
        : { status: "never", detail: null, at: null },
  }
}
