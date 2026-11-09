import type { LocationKind } from "@/lib/types/locations"

/** GET /api/admin/coverage (#156): where the map has locations. */
export interface Coverage {
  /** Active vending machines per state, most first (top 12), and how many states have any. */
  vendingByState: { state: string; count: number }[]
  states: number
  /** Active vending machines per retailer, most first (top 8), and how many retailers there are. */
  byRetailer: { retailer: string; count: number }[]
  retailers: number
  /** Active locations by kind. */
  totals: Partial<Record<LocationKind, number>>
  /** Supported countries with their locations, and the ones planned next. */
  countries: { name: string; count: number; status: "live" | "next" }[]
}

/** Countries planned after the US (R9), shown as Next. */
export const NEXT_COUNTRIES = ["Canada"] as const
