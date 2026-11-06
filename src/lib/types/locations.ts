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
}

export type LocationFeature = Feature<Point, LocationFeatureProperties>
export type LocationFeatureCollection = FeatureCollection<Point, LocationFeatureProperties>
