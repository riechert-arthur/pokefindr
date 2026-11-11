import "server-only"
import { sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { getRouter } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { withinServerBudget } from "@/server/api-rate-limit"
import { straightLine } from "@/server/adapters/router/fake"
import type { RateRule } from "@/server/ports/rate-limiter"
import type { RouteBudget, RoutePoint, Router } from "@/server/ports/router"
import type { RouteStop, StreetRoute } from "@/lib/types/routes"
import { queryFeatures } from "./locations"
import { log } from "@/server/log"

/** The most stops in a route, as the assistant's plan_route allows. */
export { MAX_STOPS } from "@/server/assistant/tools"

/** Past this the map gets straight lines rather than waiting on the provider. */
export const ROUTE_TIMEOUT_MS = 4000

/** The active, positioned places among `ids`, in the order given. */
export async function getRouteStops(ids: readonly string[], db: Database = getDb()): Promise<RouteStop[]> {
  if (ids.length === 0) return []
  const fc = await queryFeatures(db, sql`l.id in (${sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `)})`, ids.length)
  const byId = new Map(
    fc.features.map((f) => [f.properties.id, { id: f.properties.id, retailer: f.properties.retailer, lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] }]),
  )
  return ids.flatMap((id) => byId.get(id) ?? [])
}

/**
 * Two server-wide buckets in front of the provider: its per-minute limit, and
 * ROUTER_DAILY_CAP over any 24 hours. A bucket of half the cap that refills
 * half the cap a day can't spend more than the cap in any 24 hours.
 */
export function providerBudget(dailyCap: number, perMinute: RouteBudget = { perMinute: 30, burst: 30 }): RateRule[] {
  const half = Math.floor(dailyCap / 2)
  return [
    { name: "router-minute", ...perMinute },
    { name: "router-day", perMinute: half / (24 * 60), burst: half },
  ]
}

async function underBudget(rules: RateRule[]): Promise<boolean> {
  for (const rule of rules) if (!(await withinServerBudget(rule))) return false
  return true
}

/**
 * The route through `stops` along the streets, or straight lines when the
 * provider fails, takes over ROUTE_TIMEOUT_MS, or the server is over its
 * daily cap. Never throws for the provider; rethrows only if `signal`
 * (the caller) gave up.
 */
export async function streetRoute(
  stops: RouteStop[],
  { signal, router = getRouter() }: { signal?: AbortSignal; router?: Router } = {},
): Promise<StreetRoute> {
  const points: RoutePoint[] = stops.map((s) => [s.lng, s.lat])
  const fallback = () => ({ ...straightLine(points), stops })
  // Not set up (tests, or production without a key): straight lines, without spending the budget.
  if (router.free) return fallback()
  if (!(await underBudget(providerBudget(getServerConfig().ROUTER_DAILY_CAP, router.budget)))) {
    console.warn("[route] over the routing budget; drawing straight lines")
    return fallback()
  }
  const signals = [AbortSignal.timeout(ROUTE_TIMEOUT_MS), ...(signal ? [signal] : [])]
  try {
    const result = await router.route(points, { signal: AbortSignal.any(signals) })
    return { ...result, stops }
  } catch (err) {
    if (signal?.aborted) throw err
    log.logError("route.routing_failed", err, { fallback: "straight" }, "warn")
    return fallback()
  }
}
