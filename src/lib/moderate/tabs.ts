/** /moderate's tabs (#293), picked with `?tab=`. A plain module, so /admin's server page can map old links too. */
export const MODERATE_TABS = ["queue", "reports"] as const
export type ModerateTab = (typeof MODERATE_TABS)[number]

/** `?tab=`: the one asked for, else the review queue. */
export const tabFor = (param: string | string[] | null | undefined): ModerateTab => MODERATE_TABS.find((t) => t === param) ?? "queue"

/** The /moderate link for a tab; the queue is the page itself. */
export const moderateHref = (tab: ModerateTab) => (tab === "queue" ? "/moderate" : `/moderate?tab=${tab}`)
