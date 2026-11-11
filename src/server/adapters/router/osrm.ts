import "server-only"
import { RouterError, type RouteOptions, type RoutePoint, type RouteResult, type Router } from "@/server/ports/router"
import { endpoint } from "@/server/adapters/geocoder/shared"
import { round } from "@/lib/map/geo"

interface OsrmResponse {
  code?: string
  routes?: {
    geometry?: { type?: string; coordinates?: [number, number][] }
    distance?: number
    duration?: number
    legs?: { distance?: number; duration?: number }[]
  }[]
}

/** The project's public demo server: light use only, never production (its usage policy). */
export const OSRM_DEMO_URL = "https://router.project-osrm.org"

const METERS_PER_MILE = 1609.344
/** How far a stop may be from a road and still be routed to it, as for OpenRouteService. */
const SNAP_METERS = 1000
/** The demo server's policy asks every caller to say who it is. */
const USER_AGENT = "PokeFindr/dev (+https://github.com/riechert-arthur/pokefindr)"

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n)

/**
 * OSRM (#348), car profile: the fastest drive, on OpenStreetMap data like
 * the map. With no key, local dev uses the public demo server, so `make run`
 * draws routes along the streets without an account. Production needs a
 * self-hosted instance (ROUTER_BASE_URL); config refuses the demo server there.
 * https://project-osrm.org/docs/v5.24.0/api/#route-service
 */
export class OsrmRouter implements Router {
  constructor(private readonly baseUrl = OSRM_DEMO_URL) {}

  async route(stops: readonly RoutePoint[], opts?: RouteOptions): Promise<RouteResult> {
    const coords = stops.map(([lng, lat]) => `${lng},${lat}`).join(";")
    const url = endpoint(this.baseUrl, `route/v1/driving/${coords}`)
    url.search = new URLSearchParams({
      overview: "full",
      geometries: "geojson",
      steps: "false",
      radiuses: stops.map(() => SNAP_METERS).join(";"),
    }).toString()
    let res: Response
    try {
      res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": USER_AGENT }, signal: opts?.signal })
    } catch (err) {
      if (opts?.signal?.aborted) throw err
      throw new RouterError("OSRM routing failed (no response)")
    }
    if (!res.ok) throw new RouterError(`OSRM routing failed with status ${res.status}`, res.status)
    let body: OsrmResponse
    try {
      body = (await res.json()) as OsrmResponse
    } catch (err) {
      if (opts?.signal?.aborted) throw err
      throw new RouterError("OSRM routing failed (not JSON)")
    }
    return toResult(body, stops.length)
  }
}

function toResult(body: OsrmResponse, stopCount: number): RouteResult {
  // "NoRoute" and friends come with a 200 on some versions.
  const route = body.code === "Ok" ? body.routes?.[0] : undefined
  const coords = route?.geometry?.type === "LineString" ? route.geometry.coordinates : undefined
  const legs = route?.legs
  if (!route || !coords || coords.length < 2 || !legs || legs.length !== stopCount - 1)
    throw new RouterError("OSRM routing failed (unexpected answer)")
  const line: [number, number][] = []
  for (const c of coords) {
    if (!Array.isArray(c) || !finite(c[0]) || !finite(c[1])) throw new RouterError("OSRM routing failed (unexpected answer)")
    const p: [number, number] = [round(c[0], 5), round(c[1], 5)]
    const last = line[line.length - 1]
    if (!last || last[0] !== p[0] || last[1] !== p[1]) line.push(p)
  }
  if (line.length === 1) line.push(line[0])
  const distance = finite(route.distance) ? route.distance : legs.reduce((sum, l) => sum + (l.distance ?? 0), 0)
  const duration = finite(route.duration) ? route.duration : legs.reduce((sum, l) => sum + (l.duration ?? 0), 0)
  return {
    routed: true,
    line: { type: "LineString", coordinates: line },
    legs: legs.map((l) => ({ miles: round((l.distance ?? 0) / METERS_PER_MILE, 1), minutes: Math.round((l.duration ?? 0) / 60) })),
    miles: round(distance / METERS_PER_MILE, 1),
    minutes: Math.round(duration / 60),
  }
}
