import { CalendarDaysIcon, StoreIcon, createLucideIcon, type LucideIcon } from "lucide-react"
import type { LocationKind } from "@/lib/types/locations"

export type { LocationKind }

/** A vending machine in lucide's style (from the redesign prototype). */
export const VendingMachineIcon = createLucideIcon("VendingMachine", [
  ["rect", { width: "16", height: "20", x: "4", y: "2", rx: "2", key: "body" }],
  ["path", { d: "M8 6h5", key: "row1" }],
  ["path", { d: "M8 10h5", key: "row2" }],
  ["path", { d: "M16 6v.01", key: "btn1" }],
  ["path", { d: "M16 10v.01", key: "btn2" }],
  ["path", { d: "M8 17h8", key: "slot" }],
])


export interface KindMeta {
  /** Plural label for chips and filters. */
  label: string
  /** Short label for tight rows ("Vending" instead of "Vending machines"). */
  short: string
  one: string
  many: string
  icon: LucideIcon
  /** Token classes for this kind's color. */
  bg: string
  text: string
}

/**
 * Every location kind, in display order. Colors are the `--kind-*` tokens, so
 * the map, chips, list icons and assistant cards always agree.
 */
export const KINDS: Record<LocationKind, KindMeta> = {
  vending: { label: "Vending machines", short: "Vending", one: "vending machine", many: "vending machines", icon: VendingMachineIcon, bg: "bg-kind-vending", text: "text-kind-vending" },
  shop: { label: "Card shops", short: "Shops", one: "card shop", many: "card shops", icon: StoreIcon, bg: "bg-kind-shop", text: "text-kind-shop" },
  event: { label: "Events", short: "Events", one: "event", many: "events", icon: CalendarDaysIcon, bg: "bg-kind-event", text: "text-kind-event" },
}

export const KIND_ORDER: LocationKind[] = ["vending", "shop", "event"]

/** A kind from untrusted data (the API): unknown or missing values are vending machines, today's only kind. */
export const toKind = (value: unknown): LocationKind =>
  typeof value === "string" && Object.hasOwn(KINDS, value) ? (value as LocationKind) : "vending"

/** "1,457": counts are always formatted the same way. */
export const formatCount = (n: number) => n.toLocaleString("en-US")

/** "1 vending machine", "12 card shops". */
export function countLabel(kind: LocationKind, n: number): string {
  return `${formatCount(n)} ${n === 1 ? KINDS[kind].one : KINDS[kind].many}`
}
