import type { StreetRouteLeg } from "@/lib/types/routes"

/**
 * Draws a driving route through stops in order (#288). Adapters live in
 * `src/server/adapters/router/`; `getRouter()` (src/server/container.ts)
 * picks one from config.
 */

/** [lng, lat]. */
export type RoutePoint = readonly [number, number]

/** Miles and minutes between two consecutive stops. */
export type RouteLeg = StreetRouteLeg

export interface RouteResult {
  /** True when the line follows the roads; false for straight lines between the stops. */
  routed: boolean
  line: { type: "LineString"; coordinates: [number, number][] }
  /** One per pair of consecutive stops. */
  legs: RouteLeg[]
  miles: number
  minutes: number | null
}

export interface RouteOptions {
  signal?: AbortSignal
}

export interface Router {
  /** A route through `stops` (2 or more) in the order given. */
  route(stops: readonly RoutePoint[], opts?: RouteOptions): Promise<RouteResult>
}

/** A provider answered with an error (bad key, quota, a stop off the road network, an outage). */
export class RouterError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = "RouterError"
  }
}
