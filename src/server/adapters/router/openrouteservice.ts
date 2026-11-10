import "server-only"
import { RouterError, type RouteOptions, type RoutePoint, type RouteResult, type Router } from "@/server/ports/router"
import { endpoint } from "@/server/adapters/geocoder/shared"

interface OrsResponse {
  features?: {
    geometry?: { type?: string; coordinates?: [number, number][] }
    properties?: {
      summary?: { distance?: number; duration?: number }
      segments?: { distance?: number; duration?: number }[]
    }
  }[]
}

const METERS_PER_MILE = 1609.344
/** How far a stop may be from a road and still be routed to it. ORS's default, 350 m, misses machines deep in a mall's lot. */
const SNAP_METERS = 1000

const round = (n: number, places: number) => Math.round(n * 10 ** places) / 10 ** places
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)

/**
 * OpenRouteService (HeiGIT), driving, on OpenStreetMap data like the map.
 * The free plan allows 2,000 directions a day and 40 a minute; the route
 * service keeps under that (ROUTER_DAILY_CAP). The key goes in the
 * Authorization header, never the URL. The old api.openrouteservice.org
 * host is shut off, so this defaults to api.heigit.org.
 * https://giscience.github.io/openrouteservice/api-reference/endpoints/directions/
 */
export class OpenRouteServiceRouter implements Router {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.heigit.org/openrouteservice",
  ) {}

  async route(stops: readonly RoutePoint[], opts?: RouteOptions): Promise<RouteResult> {
    const url = endpoint(this.baseUrl, "v2/directions/driving-car/geojson")
    let res: Response
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { Authorization: this.apiKey, "Content-Type": "application/json", Accept: "application/geo+json, application/json" },
        body: JSON.stringify({
          coordinates: stops.map(([lng, lat]) => [lng, lat]),
          radiuses: stops.map(() => SNAP_METERS),
          instructions: false,
          preference: "recommended",
        }),
        signal: opts?.signal,
      })
    } catch (err) {
      if (opts?.signal?.aborted) throw err
      throw new RouterError("OpenRouteService routing failed (no response)")
    }
    if (!res.ok) throw new RouterError(`OpenRouteService routing failed with status ${res.status}`, res.status)
    let body: OrsResponse
    try {
      body = (await res.json()) as OrsResponse
    } catch (err) {
      if (opts?.signal?.aborted) throw err
      throw new RouterError("OpenRouteService routing failed (not JSON)")
    }
    return toResult(body, stops.length)
  }
}

function toResult(body: OrsResponse, stopCount: number): RouteResult {
  const feature = body.features?.[0]
  const coords = feature?.geometry?.type === "LineString" ? feature.geometry.coordinates : undefined
  const segments = feature?.properties?.segments
  if (!coords || coords.length < 2 || !segments || segments.length !== stopCount - 1)
    throw new RouterError("OpenRouteService routing failed (unexpected answer)")
  // Five decimals is about a meter: plenty for a line on the map, and a much smaller response.
  const line: [number, number][] = []
  for (const c of coords) {
    if (!Array.isArray(c) || !finite(c[0]) || !finite(c[1])) throw new RouterError("OpenRouteService routing failed (unexpected answer)")
    const p: [number, number] = [round(c[0], 5), round(c[1], 5)]
    const last = line[line.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) line.push(p)
  }
  // Stops on the same spot: still a line, of no length.
  if (line.length === 1) line.push(line[0])
  const legs = segments.map((s) => ({ miles: round((s.distance ?? 0) / METERS_PER_MILE, 1), minutes: Math.round((s.duration ?? 0) / 60) }))
  const summary = feature.properties?.summary
  return {
    routed: true,
    line: { type: "LineString", coordinates: line },
    legs,
    miles: round((summary?.distance ?? segments.reduce((sum, s) => sum + (s.distance ?? 0), 0)) / METERS_PER_MILE, 1),
    minutes: Math.round((summary?.duration ?? segments.reduce((sum, s) => sum + (s.duration ?? 0), 0)) / 60),
  }
}
