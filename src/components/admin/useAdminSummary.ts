"use client"

import { useCallback, useEffect, useState } from "react"
import { REPORTS_HOT } from "@/lib/admin/reports"
import { queueIsLate, type AdminSummary } from "@/lib/admin/summary"
import type { SectionCount } from "@/components/admin/AdminSidebar"

/** How often the counts refresh while /admin or /moderate is open. */
const SUMMARY_EVERY_MS = 60_000

/**
 * The counts from /api/admin/summary (moderators get only the queue and
 * reports), refreshed every minute and when the window gets focus. Returns
 * them (null until the first answer) and a function to refresh now, for
 * sections to call after a change (see useRefreshSummary).
 */
export function useAdminSummary(): [AdminSummary | null, () => void] {
  const [summary, setSummary] = useState<AdminSummary | null>(null)
  const refresh = useCallback(() => {
    fetch("/api/admin/summary", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<AdminSummary>) : null))
      .then((s) => s && setSummary(s))
      .catch(() => {})
  }, [])
  useEffect(() => {
    refresh()
    const timer = setInterval(refresh, SUMMARY_EVERY_MS)
    window.addEventListener("focus", refresh)
    return () => {
      clearInterval(timer)
      window.removeEventListener("focus", refresh)
    }
  }, [refresh])
  return [summary, refresh]
}

/** The queue's and Reports' counts beside their names; red when something waited too long or a place has many reports. */
export function moderationCounts(summary: AdminSummary | null): Record<string, SectionCount> {
  return summary
    ? {
        queue: { count: summary.queue.count, hot: queueIsLate(summary.queue) },
        reports: { count: summary.reports.locations, hot: summary.reports.maxOnOne >= REPORTS_HOT },
      }
    : {}
}
