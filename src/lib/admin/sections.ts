import { can, type Entitlement } from "@/lib/auth/entitlements"
import type { Role } from "@/lib/auth/roles"

/**
 * The admin's sections (#152), grouped as in the prototype's sidebar. Each
 * is `/admin?section=<id>`, shown to whoever has its entitlement
 * (src/lib/auth/entitlements.ts).
 */
export interface AdminSection {
  id: string
  label: string
  /** The page's one-line description, under its title. */
  sub: string
  /** What opening it needs. */
  entitlement: Entitlement
}

export interface AdminGroup {
  id: string
  label: string
  sections: readonly AdminSection[]
}

export const ADMIN_GROUPS: readonly AdminGroup[] = [
  {
    id: "moderation",
    label: "Moderation",
    sections: [
      { id: "queue", label: "Review queue", sub: "New card shops and events wait here before they go on the map.", entitlement: "moderation.view" },
      { id: "reports", label: "Reports", sub: "Problems people reported on live locations.", entitlement: "moderation.view" },
    ],
  },
  {
    id: "locations",
    label: "Locations",
    sections: [
      { id: "coverage", label: "Coverage", sub: "Where the map has locations today.", entitlement: "admin.coverage" },
      {
        id: "add-vending",
        label: "Add vending machine",
        sub: "Add a machine missing from the official list. Anything that overlaps an existing machine is blocked.",
        entitlement: "admin.vending",
      },
    ],
  },
  {
    id: "system",
    label: "System",
    sections: [
      { id: "jobs", label: "Jobs", sub: "Background jobs that keep locations up to date.", entitlement: "admin.jobs" },
      { id: "ads", label: "Ads", sub: "Turn sponsored placements on or off.", entitlement: "admin.ads" },
    ],
  },
]

export const ADMIN_SECTIONS: readonly AdminSection[] = ADMIN_GROUPS.flatMap((g) => g.sections)
export const DEFAULT_SECTION = "queue"

/** Whether `role` may open `section`. */
export const canOpen = (role: Role | null | undefined, section: AdminSection) => can(role, section.entitlement)

/** The groups `role` sees, each with only the sections it may open; empty groups dropped. */
export function groupsFor(role: Role | null | undefined): AdminGroup[] {
  return ADMIN_GROUPS.map((g) => ({ ...g, sections: g.sections.filter((s) => canOpen(role, s)) })).filter((g) => g.sections.length > 0)
}

/** The section to show for `?section=`: the one asked for if `role` may open it, else the first it may. */
export function sectionFor(id: string | null | undefined, role: Role | null | undefined): AdminSection | null {
  const allowed = ADMIN_SECTIONS.filter((s) => canOpen(role, s))
  return allowed.find((s) => s.id === id) ?? allowed[0] ?? null
}
