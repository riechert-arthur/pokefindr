/** A stop as /api/route returns it (#288): only what the map draws. */
export interface RouteStop {
  id: string
  retailer: string
  lng: number
  lat: number
}

export interface StreetRouteLeg {
  /** Driving miles, or straight-line miles when the route isn't `routed`. */
  miles: number
  /** Driving minutes; null when the route isn't `routed`. */
  minutes: number | null
}

/** /api/route's answer. An explicit shape, never a row, so no internal column can leak. */
export interface StreetRoute {
  /** False when these are straight lines: routing failed, was slow, is over its cap, or isn't set up. */
  routed: boolean
  line: { type: "LineString"; coordinates: [number, number][] }
  /** One per pair of consecutive stops. */
  legs: StreetRouteLeg[]
  miles: number
  minutes: number | null
  /** The stops found, in visiting order. Ids that aren't active places are left out. */
  stops: RouteStop[]
}
