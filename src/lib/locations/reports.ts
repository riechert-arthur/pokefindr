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

/** How an admin closed a report (#153). */
export const REPORT_RESOLUTIONS = ["dismissed", "fixed", "hidden"] as const
export type ReportResolution = (typeof REPORT_RESOLUTIONS)[number]

/** What an admin can do with a location's reports (#153). Reopen undoes the last one (and unhides). */
export const REPORT_ACTIONS = ["dismiss", "fix", "hide", "reopen"] as const
export type ReportAction = (typeof REPORT_ACTIONS)[number]

export const RESOLUTION_OF: Record<Exclude<ReportAction, "reopen">, ReportResolution> = { dismiss: "dismissed", fix: "fixed", hide: "hidden" }
