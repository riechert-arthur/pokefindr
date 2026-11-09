/** Why an existing machine blocks a new one (#154). */
export const OVERLAP_REASONS = ["machine_id", "address", "distance"] as const
export type OverlapReason = (typeof OVERLAP_REASONS)[number]

export const OVERLAP_LABELS: Record<OverlapReason, string> = { machine_id: "Same machine ID", address: "Same address", distance: "Same spot" }

/** Two pins closer than this are the same spot: 80 m, about 260 ft. */
export const SAME_SPOT_METERS = 80

/** An existing machine that overlaps the one being added. */
export interface VendingOverlap {
  id: string
  machineId: string | null
  retailer: string
  address: string
  city: string
  state: string
  /** Straight-line distance from the new pin. */
  meters: number
  reasons: OverlapReason[]
  /** Hidden or inactive machines still block the same machine ID. */
  active: boolean
}

export interface VendingCandidate {
  machineId: string
  address: string
  state: string
  lat: number
  lng: number
}

/** What the Add vending machine form sends (#155). */
export interface NewVendingMachine extends VendingCandidate {
  retailer: string
  city: string
}

/** "Kirkland, WA" → { city: "Kirkland", state: "WA" }, or null until it has both. */
export function parseCityState(value: string): { city: string; state: string } | null {
  const m = /^\s*(.+?)\s*,\s*([A-Za-z]{2})\s*$/.exec(value)
  return m ? { city: m[1], state: m[2].toUpperCase() } : null
}

/** "47.70793, -122.18380" → { lat, lng }, or null when it isn't a valid pair. */
export function parsePin(value: string): { lat: number; lng: number } | null {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(value)
  if (!m) return null
  const lat = Number(m[1])
  const lng = Number(m[2])
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null
}

export const formatPin = (lat: number, lng: number) => `${lat.toFixed(5)}, ${lng.toFixed(5)}`
