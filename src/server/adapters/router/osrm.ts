import "server-only"
import { RouterError, type RouteBudget, type RouteOptions, type RoutePoint, type RouteResult, type Router } from "@/server/ports/router"
import { endpoint } from "@/server/adapters/geocoder/shared"
import { routedResult, SNAP_METERS } from "./shared"

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

/** The demo server's policy asks every caller to say who it is. */
const USER_AGENT = "PokeFindr (+https://github.com/riechert-arthur/pokefindr)"
/** The demo server's policy: at most one request a second. A self-hosted OSRM uses the route service's default budget. */
const DEMO_BUDGET: RouteBudget = { perMinute: 60, burst: 1 }
/** Fixed decimals (about 10 cm): String(1e-7) is "1e-7", which OSRM can't parse. */
const coord = (n: number) => n.toFixed(6)

/**
 * OSRM (#348), car profile: the fastest drive, on OpenStreetMap data like
 * the map. With no key, local dev uses the public demo server, so `make run`
 * draws routes along the streets without an account. Production needs a
 * self-hosted instance (ROUTER_BASE_URL); config refuses the demo server there.
 * https://project-osrm.org/docs/v5.24.0/api/#route-service
 */
export class OsrmRouter implements Router {
  readonly budget?: RouteBudget

  constructor(private readonly baseUrl = OSRM_DEMO_URL) {
    if (baseUrl === OSRM_DEMO_URL) this.budget = DEMO_BUDGET
  }

  async route(stops: readonly RoutePoint[], opts?: RouteOptions): Promise<RouteResult> {
    const coords = stops.map(([lng, lat]) => `${coord(lng)},${coord(lat)}`).join(";")
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
  if (!route) throw new RouterError("OSRM routing failed (unexpected answer)")
  const coords = route.geometry?.type === "LineString" ? route.geometry.coordinates : undefined
  return routedResult("OSRM", coords, route.legs, stopCount, route)
}
