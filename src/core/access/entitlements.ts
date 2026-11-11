/**
 * Who may do what (#299, #323). Core's own entitlements are below; every
 * registered module adds its own from its manifest (src/modules/registry.ts),
 * so this is the one table server checks (`requireEntitlement`) and the UI
 * read. Name an entitlement after what it allows, not after a role.
 *
 * A `platform` entitlement lists the platform roles that have it; a role
 * missing from it doesn't, so a new role starts with nothing. Platform roles
 * come from `profiles.role` (migration 0012), read on every request.
 */
import { checkModules, type EntitlementRule, type EntitlementsOf, type ModuleManifest } from "@/core/shell/module"
import { ROLES, type Role } from "@/lib/auth/roles"
import { MODULES } from "@/modules/registry"

const staff = (...roles: Role[]) => ({ audience: "platform", roles }) as const

/** Core's entitlements: running PokeFindr itself, so all for staff. */
export const CORE_ENTITLEMENTS = {
  /** See the review queue, reports and their counts, in /moderate and /admin's Moderation group. */
  "moderation.view": staff("moderator", "admin", "super_admin"),
  /** Approve or reject submissions, and act on reports. */
  "moderation.decide": staff("moderator", "admin", "super_admin"),
  /** See held reviews (#253) and approve or remove them, in /moderate and /admin. Your own need moderation.decideOwn too. */
  "moderation.reviews": staff("moderator", "admin", "super_admin"),
  /** Decide a submission you sent, or a review you wrote, yourself. Moderators can't; admins (and super admins) can, so a site with one admin isn't stuck. */
  "moderation.decideOwn": staff("admin", "super_admin"),
  /** Remove someone's profile picture, which shows publicly next to their reviews (#290). */
  "moderation.avatars": staff("moderator", "admin", "super_admin"),
  /** Get the "a submission needs review" email. */
  "moderation.notify": staff("moderator", "admin", "super_admin"),
  /** Open /admin at all, and see its link. Moderators work in /moderate instead (#293). */
  "admin.open": staff("admin", "super_admin"),
  /** The admin-only summary counts: live locations and the sync job. */
  "admin.summary.all": staff("admin", "super_admin"),
  "admin.coverage": staff("admin", "super_admin"),
  /** Add a missing vending machine, or undo one. */
  "admin.vending": staff("admin", "super_admin"),
  "admin.jobs": staff("admin", "super_admin"),
  "admin.ads": staff("admin", "super_admin"),
  /** List users and change their role (member, moderator or admin). Granting super_admin stays SQL- and seed-only. */
  "users.manage": staff("super_admin"),
} as const satisfies Record<string, EntitlementRule>

export type Entitlement = keyof typeof CORE_ENTITLEMENTS | EntitlementsOf<(typeof MODULES)[number]>

/**
 * Core's rules followed by each module's, in registry order, after checking
 * the modules (a broken registry throws here, when the app starts).
 */
export function buildRules(modules: readonly ModuleManifest[], core: Readonly<Record<string, EntitlementRule>> = CORE_ENTITLEMENTS): Record<string, EntitlementRule> {
  checkModules(modules, Object.keys(core))
  return Object.assign({}, core, ...modules.map((m) => m.entitlements))
}

/** Every entitlement's rule. */
export const RULES = buildRules(MODULES) as Record<Entitlement, EntitlementRule>

/** The roles each entitlement is open to. `public` and `org` ones are open to every role (signed in). */
const rolesFor = (rule: EntitlementRule): readonly Role[] => (rule.audience === "platform" ? rule.roles : ROLES)

/** Each entitlement and the roles that have it: the permission table, as #300 had it. */
export const ENTITLEMENTS = Object.fromEntries(Object.entries(RULES).map(([e, rule]) => [e, rolesFor(rule)])) as Record<Entitlement, readonly Role[]>

/** Whether `role` has entitlement `e`. No role (signed out, no profile) has only the `public` ones. */
export function can(role: Role | null | undefined, e: Entitlement): boolean {
  if (RULES[e].audience === "public") return true
  return !!role && ENTITLEMENTS[e].includes(role)
}

/** Every entitlement `role` has, in table order. */
export function entitlementsOf(role: Role): Entitlement[] {
  return (Object.keys(ENTITLEMENTS) as Entitlement[]).filter((e) => can(role, e))
}

/** The roles that have `e`, e.g. to find who gets an email. */
export function rolesWith(e: Entitlement): Role[] {
  return [...ENTITLEMENTS[e]]
}
