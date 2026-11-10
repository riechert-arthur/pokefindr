import { can, type Entitlement } from "@/lib/auth/entitlements"
import type { Role } from "@/lib/auth/roles"

/** /moderate's tabs (#293), picked with `?tab=`. A plain module, so /admin's server page can map old links too. */
export const MODERATE_TABS = ["queue", "reviews", "reports"] as const
export type ModerateTab = (typeof MODERATE_TABS)[number]

/** What each tab needs, like the matching /admin section (src/lib/admin/sections.ts). */
const TAB_ENTITLEMENT: Record<ModerateTab, Entitlement> = {
  queue: "moderation.view",
  reviews: "moderation.reviews",
  reports: "moderation.view",
}

/** The tabs `role` may open, in order. */
export const tabsFor = (role: Role | null | undefined): ModerateTab[] => MODERATE_TABS.filter((t) => can(role, TAB_ENTITLEMENT[t]))

/** `?tab=`: the one asked for, else the review queue. */
export const tabFor = (param: string | string[] | null | undefined): ModerateTab => MODERATE_TABS.find((t) => t === param) ?? "queue"

/** The /moderate link for a tab; the queue is the page itself. */
export const moderateHref = (tab: ModerateTab) => (tab === "queue" ? "/moderate" : `/moderate?tab=${tab}`)
