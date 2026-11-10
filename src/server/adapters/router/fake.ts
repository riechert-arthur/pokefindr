import type { RoutePoint, RouteResult, Router } from "@/server/ports/router"
import { milesBetween } from "@/lib/map/geo"

/**
 * Straight lines between the stops, never `routed`. The default in dev and
 * CI, so neither needs an account, and the fallback whenever the real
 * provider fails, is slow or is over the daily cap.
 */
export class FakeRouter implements Router {
  async route(stops: readonly RoutePoint[]): Promise<RouteResult> {
    return straightLine(stops)
  }
}

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places

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
