/** What someone may do beyond using the site (migration 0012). Entitlements (#70) can replace this. */
export const ROLES = ["member", "moderator", "admin"] as const
export type Role = (typeof ROLES)[number]

/** Moderators and admins review submissions. */
export const canModerate = (role: Role | null | undefined): boolean => role === "moderator" || role === "admin"
