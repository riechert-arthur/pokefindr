import { CalendarDaysIcon, StoreIcon, createLucideIcon, type LucideIcon } from "lucide-react"

/** A vending machine in lucide's style (from the redesign prototype). */
export const VendingMachineIcon = createLucideIcon("VendingMachine", [
  ["rect", { width: "16", height: "20", x: "4", y: "2", rx: "2", key: "body" }],
  ["path", { d: "M8 6h5", key: "row1" }],
  ["path", { d: "M8 10h5", key: "row2" }],
  ["path", { d: "M16 6v.01", key: "btn1" }],
  ["path", { d: "M16 10v.01", key: "btn2" }],
  ["path", { d: "M8 17h8", key: "slot" }],
])

export type LocationKind = "vending" | "shop" | "event"

export interface KindMeta {
  kind: LocationKind
  /** Plural label for chips and filters. */
  label: string
  one: string
  many: string
  icon: LucideIcon
  /** Token classes for this kind's color. */
  bg: string
  text: string
  border: string
}

/**
 * Every location kind, in display order. Colors are the `--kind-*` tokens, so
 * the map, chips, list icons and assistant cards always agree.
 */
export const KINDS: Record<LocationKind, KindMeta> = {
  vending: { kind: "vending", label: "Vending machines", one: "vending machine", many: "vending machines", icon: VendingMachineIcon, bg: "bg-kind-vending", text: "text-kind-vending", border: "border-kind-vending" },
  shop: { kind: "shop", label: "Card shops", one: "card shop", many: "card shops", icon: StoreIcon, bg: "bg-kind-shop", text: "text-kind-shop", border: "border-kind-shop" },
  event: { kind: "event", label: "Events", one: "event", many: "events", icon: CalendarDaysIcon, bg: "bg-kind-event", text: "text-kind-event", border: "border-kind-event" },
}

export const KIND_ORDER: LocationKind[] = ["vending", "shop", "event"]

/** "1 vending machine", "12 card shops". */
export function countLabel(kind: LocationKind, n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? KINDS[kind].one : KINDS[kind].many}`
}
