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

/** GET /api/locations/near: a place's results, closest first. */
export type NearbyLocations = FeatureCollection<Point, LocationFeatureProperties & { /** Miles from the place, to 0.01. */ distance: number }> & {
  /** Matches per kind, over every match (not just the returned page). */
  counts: Partial<Record<LocationKind, number>>
  total: number
  /** More matched than `limit`; the list shows the closest. */
  truncated: boolean
}

/** Locations of one kind in one region (a US state today), from GET /api/locations/aggregates. */
export interface RegionCount {
  /** ISO 3166-1 alpha-2, e.g. "US". */
  country: string
  /** State or province code, e.g. "WA". Empty when the locations have no state. */
  region: string
  kind: LocationKind
  count: number
}
