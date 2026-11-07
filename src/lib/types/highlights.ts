/** A city with many vending machines around it (GET /api/highlights). */
export type Hotspot = {
  city: string
  /** Two-letter state code. */
  state: string
  lng: number
  lat: number
  /** Vending machines within 15 mi. */
  count: number
}

/** A published event that hasn't ended yet. */
export type UpcomingEvent = {
  id: string
  title: string
  /** ISO timestamps. */
  startsAt: string
  endsAt: string | null
  city: string
  state: string
  lng: number
  lat: number
  /** Invented (local seed data); shown with a "Sample" badge. */
  isSample: boolean
}

/** GET /api/highlights: what the zoomed-out map suggests starting from. */
export interface Highlights {
  hotspots: Hotspot[]
  events: UpcomingEvent[]
}
