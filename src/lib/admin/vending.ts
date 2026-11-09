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
