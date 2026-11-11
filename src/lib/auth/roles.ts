/**
 * Who someone is beyond a visitor (migrations 0012 and 0022). What each role
 * may do lives in ./entitlements.
 */
export const ROLES = ["member", "moderator", "admin", "super_admin"] as const
export type Role = (typeof ROLES)[number]

/**
 * The roles a super admin can give someone in User management (#294).
 * `super_admin` itself is granted only by SQL or the dev seed, so a hijacked
 * session can't create another one.
 */
export const GRANTABLE_ROLES = ["member", "moderator", "admin"] as const satisfies readonly Role[]
export type GrantableRole = (typeof GRANTABLE_ROLES)[number]

/** How a role is shown to people, e.g. in the admin sidebar. */
export const ROLE_LABELS: Record<Role, string> = { member: "Member", moderator: "Moderator", admin: "Admin", super_admin: "Super admin" }
