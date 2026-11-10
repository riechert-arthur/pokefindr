/** Who someone is beyond a visitor (migration 0012). What each role may do lives in ./entitlements. */
export const ROLES = ["member", "moderator", "admin"] as const
export type Role = (typeof ROLES)[number]
