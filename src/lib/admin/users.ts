import type { GrantableRole, Role } from "@/lib/auth/roles"

/** One person in Admin → Users (#294), as GET /api/admin/users returns them. Super admins only. */
export interface UserRow {
  id: string
  username: string
  /** Their profile's name, or the account's if the profile has none. */
  name: string
  email: string
  role: Role
  /** When the account was made (ISO). */
  joinedAt: string
}

export interface UserPage {
  users: UserRow[]
  /** Pass back as `cursor` for the next page; null on the last one. */
  nextCursor: string | null
}

/** How many users a page shows. */
export const USERS_PER_PAGE = 50

/** Why a role change was refused, as PATCH /api/admin/users/:id answers it. */
export type SetRoleRefusal = "own" | "not_found" | "invalid_role" | "last_super_admin" | "forbidden"

export type SetRoleResult = { status: "done"; from: Role; to: GrantableRole } | { status: "unchanged" } | { status: SetRoleRefusal }

/** What the person changing a role sees for each refusal. */
export const SET_ROLE_ERRORS: Record<SetRoleRefusal, string> = {
  own: "You can't change your own role.",
  not_found: "That user doesn't exist.",
  invalid_role: "Pick member, moderator or admin.",
  last_super_admin: "That's the last super admin. Make someone else one first.",
  forbidden: "You can't manage users.",
}
