/** What a "Report a problem" says is wrong (status_reports.reason, migration 0005). */
export const REPORT_REASONS = ["gone", "wrong_location", "empty", "other"] as const
export type ReportReason = (typeof REPORT_REASONS)[number]

/** The options in the panel's report form, as the prototype words them. */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  gone: "It's gone or was removed",
  wrong_location: "Wrong address or pin",
  empty: "Empty for a long time",
  other: "Something else",
}
