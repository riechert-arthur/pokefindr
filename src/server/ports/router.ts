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

/** How fast a provider may be asked, server-wide (a token bucket). */
export interface RouteBudget {
  perMinute: number
  burst: number
}

export interface Router {
  /**
   * True when a call costs no provider quota (straight lines), so the route
   * service skips the server-wide budget. Unset counts as metered.
   */
  readonly free?: boolean
  /** The provider's own per-minute limit, when stricter than the route service's default (30 a minute). */
  readonly budget?: RouteBudget
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
