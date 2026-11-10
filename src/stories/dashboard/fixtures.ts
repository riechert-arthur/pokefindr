import type { MyReview } from "@/components/dashboard/DashboardTiles"
import type { UpcomingEvent } from "@/lib/types/highlights"

/** A place name long enough to truncate at every column count (#302). */
export const LONG_NAME = "Pokémon Center Vending Machine — Westfield Valley Fair Mall, Santa Clara"

export const longReviews: MyReview[] = [
  { id: "r1", rating: 4.5, comment: "Restocked on Tuesday mornings, ask at the customer service desk", location: { id: "l1", name: LONG_NAME, city: "Santa Clara", state: "CA" } },
  { id: "r2", rating: 5, comment: null, location: { id: "l2", name: "Target — Shops at Northeast Plaza, North Richland Hills", city: "North Richland Hills", state: "TX" } },
  { id: "r3", rating: 2, comment: "Empty", location: { id: "l3", name: "Safeway", city: "Seattle", state: "WA" } },
]

/** Days from now, so the events stay upcoming and in the current year whenever the story renders. */
export const inDays = (days: number, hours = 0) => new Date(Date.now() + (days * 24 + hours) * 3_600_000).toISOString()

export const longEvents: UpcomingEvent[] = [
  { id: "e1", title: "Regional Championship Pre-Release Tournament and Card Swap Meet", startsAt: inDays(3), endsAt: null, city: "Rancho Cucamonga", state: "CA", lng: -117.59, lat: 34.1, isSample: false },
  { id: "e2", title: "League night", startsAt: inDays(8), endsAt: inDays(8, 3), city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: false },
]
