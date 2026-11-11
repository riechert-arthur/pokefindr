import "server-only"
import { RouterError, type RouteOptions, type RoutePoint, type RouteResult, type Router } from "@/server/ports/router"
import { endpoint } from "@/server/adapters/geocoder/shared"
import { routedResult, SNAP_METERS } from "./shared"

interface OrsResponse {
  features?: {
    geometry?: { type?: string; coordinates?: [number, number][] }
    properties?: {
      summary?: { distance?: number; duration?: number }
      segments?: { distance?: number; duration?: number }[]
    }
  }[]
}

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
          // The quickest drive (#348), as the Google Maps link next to it gives.
          preference: "fastest",
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
  return routedResult("OpenRouteService", coords, feature?.properties?.segments, stopCount, feature?.properties?.summary)
}
