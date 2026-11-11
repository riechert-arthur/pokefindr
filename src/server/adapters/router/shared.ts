import "server-only"
import { RouterError, type RouteLeg, type RouteResult } from "@/server/ports/router"
import { round } from "@/lib/map/geo"

/**
 * What the street-routing adapters share (OpenRouteService, OSRM): turning a
 * provider's line and per-leg meters and seconds into a RouteResult, so a fix
 * to one can't be missed in the other.
 */

const METERS_PER_MILE = 1609.344
/** How far a stop may be from a road and still be routed to it. ORS's default, 350 m, misses machines deep in a mall's lot. */
export const SNAP_METERS = 1000

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)

/** Meters and seconds as the provider gives them. */
export interface ProviderLeg {
  distance?: number
  duration?: number
}

/**
 * A routed result from a provider's line and legs (one per pair of stops),
 * with totals from `total` when given, else the legs' sum. Throws a
 * RouterError naming `provider` when the answer doesn't fit.
 */
export function routedResult(provider: string, coords: unknown, legs: readonly ProviderLeg[] | undefined, stopCount: number, total?: ProviderLeg): RouteResult {
  const unexpected = () => new RouterError(`${provider} routing failed (unexpected answer)`)
  if (!Array.isArray(coords) || coords.length < 2 || !legs || legs.length !== stopCount - 1) throw unexpected()
  // Five decimals is about a meter: plenty for a line on the map, and a much smaller response.
  const line: [number, number][] = []
  for (const c of coords as unknown[]) {
    if (!Array.isArray(c) || !finite(c[0]) || !finite(c[1])) throw unexpected()
    const p: [number, number] = [round(c[0], 5), round(c[1], 5)]
    const last = line[line.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) line.push(p)
  }
  // Stops on the same spot: still a line, of no length.
  if (line.length === 1) line.push(line[0])
  const sum = (k: keyof ProviderLeg) => legs.reduce((s, l) => s + (l[k] ?? 0), 0)
  const distance = finite(total?.distance) ? total.distance : sum("distance")
  const duration = finite(total?.duration) ? total.duration : sum("duration")
  const toLeg = (l: ProviderLeg): RouteLeg => ({ miles: round((l.distance ?? 0) / METERS_PER_MILE, 1), minutes: Math.round((l.duration ?? 0) / 60) })
  return {
    routed: true,
    line: { type: "LineString", coordinates: line },
    legs: legs.map(toLeg),
    miles: round(distance / METERS_PER_MILE, 1),
    minutes: Math.round(duration / 60),
  }
}
