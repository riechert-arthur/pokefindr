import "server-only"
import { eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locationSubmissions } from "@/server/db/schema"
import type { AdminSummary } from "@/lib/admin/summary"
import { openReportCounts } from "@/server/services/report-admin"

/** The admin's counts (#152, #158), in one round trip per part. */
export async function getAdminSummary(db: Database = getDb()): Promise<AdminSummary> {
  const [[queue], reports] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int`, oldestAt: sql<string | null>`min(${locationSubmissions.createdAt})` })
      .from(locationSubmissions)
      .where(eq(locationSubmissions.status, "pending")),
    openReportCounts(db),
  ])
  return { queue: { count: queue.count, oldestAt: queue.oldestAt ? new Date(queue.oldestAt).toISOString() : null }, reports }
}
