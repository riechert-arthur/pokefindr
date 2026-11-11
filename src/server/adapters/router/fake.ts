import type { RoutePoint, RouteResult, Router } from "@/server/ports/router"
import { milesBetween, round } from "@/lib/map/geo"

/**
 * Straight lines between the stops, never `routed`. The default in tests and
 * in production without a key (see ROUTER_PROVIDER), and the fallback whenever the real
 * provider fails, is slow or is over the daily cap.
 */
export class FakeRouter implements Router {
  /** Costs no provider quota, so the route service doesn't spend its budget on it. */
  readonly free = true

  async route(stops: readonly RoutePoint[]): Promise<RouteResult> {
    return straightLine(stops)
  }
}

export function straightLine(stops: readonly RoutePoint[]): RouteResult {
  const legs = stops.slice(1).map((to, i) => {
    const from = stops[i]
    return { miles: round(milesBetween(from[0], from[1], to[0], to[1]), 1), minutes: null }
  })
  return {
    routed: false,
    line: { type: "LineString", coordinates: stops.map(([lng, lat]) => [lng, lat]) },
    legs,
    miles: round(legs.reduce((sum, l) => sum + l.miles, 0), 1),
    minutes: null,
  }
}
