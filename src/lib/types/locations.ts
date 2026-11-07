import type { Feature, FeatureCollection, Point } from "geojson"

/** Properties on every map feature served by GET /api/locations. */
export interface LocationFeatureProperties {
  /** Database id (locations.id). Use this to fetch details and reviews. */
  id: string
  /** Pokémon machine id, e.g. "Q00350". Empty for user-submitted locations. */
  machineID: string
  retailer: string
  address: string
  city: string
  state: string
  /** What kind of place this is. Absent on older data, which is all vending machines. */
  kind?: LocationKind
}

/** Every kind of place, as stored in `locations.kind`. */
export const LOCATION_KINDS = ["vending", "shop", "event"] as const
export type LocationKind = (typeof LOCATION_KINDS)[number]

export type LocationFeature = Feature<Point, LocationFeatureProperties>
export type LocationFeatureCollection = FeatureCollection<Point, LocationFeatureProperties> & {
  /** Set on viewport queries: true when more locations matched than were returned. */
  truncated?: boolean
}
