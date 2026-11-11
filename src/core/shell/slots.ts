/**
 * Slots (docs/architecture.md, "Slots"; #324): the named places where core
 * renders or collects what modules contribute. Core owns each slot's name and
 * contract; a module fills it from its manifest (`contributes`). Changing a
 * contract is a core change, reviewed as one.
 *
 * Client-safe: manifests and `<Slot>` import this. Server-only contributions
 * (assistant and MCP tools, job code, sitemap entries) aren't here: they're in
 * each module's `module.server.ts`, listed in src/modules/registry.server.ts,
 * so the browser bundle never reaches server code (see server-slots.ts).
 */
import type { ComponentType } from "react"

/** The place a details contribution is about: what any module needs to find its own data for it. */
export interface SlotPlace {
  readonly id: string
  /** vending, shop or event, when known. */
  readonly kind?: string
  readonly retailer: string
  readonly city: string
  readonly state: string
}

/**
 * UI slots and the props a contribution receives. Each renders where its
 * name says, through `<Slot name props>`.
 */
export interface UiSlots {
  /** In a place's details, after its header (LocationDetails). */
  "location.details.section": { location: SlotPlace }
  /** Between results in the map's list, after the third (ResultsSheet). `count` is how many results there are. */
  "results.inline": { count: number }
  /** A band between the landing page's sections, after How it works. */
  "landing.section": Record<string, never>
  /** Drawn on the map, inside it (MapInstance). */
  "map.layer": Record<string, never>
  /** A button with the map's actions (MapInstance, next to Add a place). */
  "map.action": Record<string, never>
  /** A tile on the signed-in dashboard (/home). */
  "dashboard.tile": Record<string, never>
  /** A section of /settings. */
  "settings.section": Record<string, never>
  /** A section of the privacy policy, for what a module collects or shares. */
  "legal.privacy.section": Record<string, never>
}
export type UiSlotName = keyof UiSlots

/** One module's contribution to a UI slot, loaded only when the slot renders. */
export interface UiContribution<P> {
  /** Unique within the slot and module; the React key. */
  readonly id: string
  /** Shown only to viewers with this entitlement (`can()`). */
  readonly entitlement?: string
  /** Lower first; ties keep registry order. Default 0. */
  readonly order?: number
  readonly load: () => Promise<{ default: ComponentType<P> }>
}

/** A section of the staff console (/admin), in one of its sidebar groups. */
export interface StaffSection {
  readonly id: string
  /** The sidebar group: an existing one (`moderation`, `locations`, `system`, `people`) or a new id. */
  readonly group: string
  readonly label: string
  readonly sub: string
  readonly entitlement: string
  readonly load: () => Promise<{ default: ComponentType<Record<string, never>> }>
}

/** What a manifest can contribute. All optional; every value is client-safe data or a lazy import. */
export type Contributions = {
  readonly [N in UiSlotName]?: readonly UiContribution<UiSlots[N]>[]
} & {
  readonly "staff.console.section"?: readonly StaffSection[]
  /** `<meta name content>` tags on every page, e.g. a verification tag. */
  readonly "head.meta"?: Readonly<Record<string, string>>
  /** Product event names the module sends with `track()`. */
  readonly "analytics.events"?: readonly string[]
  /**
   * The module's jobs, by name, with the cron schedule of the scheduled ones.
   * The code is in `module.server.ts`; `npm run modules:sync` writes the crons to vercel.json.
   */
  readonly jobs?: Readonly<Record<string, { readonly schedule?: string }>>
}

/** The slot names a manifest may use. */
export const SLOT_NAMES = [
  "location.details.section",
  "results.inline",
  "landing.section",
  "map.layer",
  "map.action",
  "dashboard.tile",
  "settings.section",
  "legal.privacy.section",
  "staff.console.section",
  "head.meta",
  "analytics.events",
  "jobs",
] as const satisfies readonly (keyof Contributions)[]

/** The server-side slots, contributed from `module.server.ts` (server-slots.ts). */
export const SERVER_SLOT_NAMES = ["assistant.tools", "mcp.tools", "jobs", "sitemap"] as const
