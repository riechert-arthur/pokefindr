import type { ReportAction, ReportReason, ReportResolution } from "@/lib/locations/reports"

/** A reported location on the admin's Reports page (#153). */
export interface ReportedLocation {
  location: { id: string; name: string; address: string; city: string; state: string; machineId: string | null; kind: string; hidden: boolean }
  /** Reports not acted on yet. */
  open: number
  /** Reports listed (open, and resolved in the last 30 days). */
  total: number
  /** The most common reason among the open reports (or all of them, once resolved). */
  reason: ReportReason | null
  lastReportAt: string
  status: "open" | ReportResolution
  lastAction: { action: ReportAction; at: string; by: string } | null
}

/** A location with this many open reports is urgent: its count turns red. */
export const REPORTS_HOT = 3
