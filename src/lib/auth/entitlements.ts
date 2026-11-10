/**
 * What each role may do (#299). The only place that maps roles to access:
 * server checks (`requireEntitlement`) and the UI both read it. Name an
 * entitlement after what it allows, not after a role, and add a role by
 * listing it under each entitlement it gets. A role missing from an entry
 * doesn't have it, so a new role starts with nothing.
 *
 * Roles come from `profiles.role` (migration 0012), read on every request.
 */
import type { Role } from "./roles"

export const ENTITLEMENTS = {
  /** See the review queue, reports and their counts. */
  "moderation.view": ["moderator", "admin", "super_admin"],
  /** Approve or reject submissions, and act on reports. */
  "moderation.decide": ["moderator", "admin", "super_admin"],
  /** Decide a submission you sent yourself. Moderators can't; admins (and super admins) can, so a site with one admin isn't stuck. */
  "moderation.decideOwn": ["admin", "super_admin"],
  /** Remove someone's profile picture, which shows publicly next to their reviews (#290). */
  "moderation.avatars": ["moderator", "admin", "super_admin"],
  /** Get the "a submission needs review" email. */
  "moderation.notify": ["moderator", "admin", "super_admin"],
  /** Open /admin at all. */
  "admin.open": ["moderator", "admin", "super_admin"],
  /** The admin-only summary counts: live locations and the sync job. */
  "admin.summary.all": ["admin", "super_admin"],
  "admin.coverage": ["admin", "super_admin"],
  /** Add a missing vending machine, or undo one. */
  "admin.vending": ["admin", "super_admin"],
  "admin.jobs": ["admin", "super_admin"],
  "admin.ads": ["admin", "super_admin"],
  /** List users and change their role (member, moderator or admin). Granting super_admin stays SQL- and seed-only. */
  "users.manage": ["super_admin"],
} as const satisfies Record<string, readonly Role[]>

export type Entitlement = keyof typeof ENTITLEMENTS

/** Whether `role` has entitlement `e`. No role (signed out, no profile) has none. */
export function can(role: Role | null | undefined, e: Entitlement): boolean {
  return !!role && (ENTITLEMENTS[e] as readonly Role[]).includes(role)
}

/** Every entitlement `role` has, in the order above. */
export function entitlementsOf(role: Role): Entitlement[] {
  return (Object.keys(ENTITLEMENTS) as Entitlement[]).filter((e) => can(role, e))
}

/** The roles that have `e`, e.g. to find who gets an email. */
export function rolesWith(e: Entitlement): Role[] {
  return [...ENTITLEMENTS[e]]
}
