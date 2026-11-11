"use client"

import { useEffect, useState } from "react"
import { MAX_ROUTE_STOPS, type StreetRoute } from "@/lib/types/routes"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type StreetRouteState =
  | { status: "loading" }
  /** `skipped`: some of the ids asked for aren't on the map anymore, so the route leaves them out. */
  | { status: "ready"; route: StreetRoute; skipped: boolean }
  /** The places are gone (or the ids can't be a route): nothing to draw. */
  | { status: "gone" }
  /** The request failed; trying again later may work. */
  | { status: "failed" }

/**
 * An assistant route from `GET /api/route`, through `ids` in visiting order:
 * the full map's RouteOverlay and the chat's route preview (#349) both use
 * it. A hand-edited link can hold a bad id or too many stops, so only the
 * ones the API takes are asked for. Answers are cached at the CDN by the
 * ordered ids, so the preview and a later "Show on map" share one.
 */
export function useStreetRoute(ids: readonly string[]): StreetRouteState {
  const key = ids.join(",")
  const [state, setState] = useState<{ key: string; value: StreetRouteState }>({ key, value: { status: "loading" } })

  useEffect(() => {
    const all = key.split(",")
    const asked = all.filter((id) => UUID.test(id)).slice(0, MAX_ROUTE_STOPS)
    const set = (value: StreetRouteState) => setState({ key, value })
    if (asked.length < 2) {
      set({ status: "gone" })
      return
    }
    set({ status: "loading" })
    const ctl = new AbortController()
    fetch(`/api/route?ids=${asked.join(",")}`, { signal: ctl.signal })
      .then(async (r) => {
        // Only a 404 (or a 400 for a link it can't route) means the places are gone; anything else is a failure to retry later.
        if (r.status === 404 || r.status === 400) return set({ status: "gone" })
        if (!r.ok) throw new Error(`GET /api/route failed (${r.status})`)
        const route = (await r.json()) as StreetRoute
        set({ status: "ready", route, skipped: route.stops.length < all.length })
      })
      .catch((err) => {
        if (ctl.signal.aborted) return
        console.error("[route] couldn't load the route", err)
        set({ status: "failed" })
      })
    return () => ctl.abort()
  }, [key])

  // A new set of ids is loading until its effect says otherwise.
  return state.key === key ? state.value : { status: "loading" }
}

/** [[west, south], [east, north]] around the whole line and every stop: a routed line can bulge past the stops. */
export function routeBounds(route: StreetRoute): [[number, number], [number, number]] {
  // One pass, not Math.min(...): a long routed line can have more points than a call takes arguments.
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity]
  for (const [lng, lat] of [...route.line.coordinates, ...route.stops.map((p) => [p.lng, p.lat])]) {
    if (lng < w) w = lng
    if (lng > e) e = lng
    if (lat < s) s = lat
    if (lat > n) n = lat
  }
  return [
    [w, s],
    [e, n],
  ]
}
