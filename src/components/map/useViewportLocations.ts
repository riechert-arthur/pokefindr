"use client"

import { useEffect, useRef, useState } from "react"
import type { LocationFeature, LocationFeatureCollection, LocationKind } from "@/lib/types/locations"
import { POINT_ZOOM } from "./layers"
import { MAX_BBOX_AREA } from "@/lib/locations/bbox"

/** The parts of a MapLibre map this hook uses, so tests can pass a fake. */
export interface ViewportMap {
  getZoom(): number
  getBounds(): { getWest(): number; getSouth(): number; getEast(): number; getNorth(): number }
  on(type: "moveend", listener: () => void): unknown
  off(type: "moveend", listener: () => void): unknown
}

export type ViewportStatus =
  /** Zoomed out below POINT_ZOOM: nothing to load. */
  | "idle"
  | "loading"
  | "ready"
  | "error"

export interface ViewportLocations {
  /** Locations in the last loaded view. Kept while the next view loads. */
  features: LocationFeature[]
  status: ViewportStatus
  /** The last view had more locations than the API returns at once. */
  truncated: boolean
}

export interface ViewportOptions {
  types: readonly LocationKind[]
  /** Vending retailers to keep, as the map's `retailer=`; filtered by the API, before its cap. Empty or absent means all. */
  retailers?: readonly string[] | null
  /** Wait this long after the map stops before fetching. */
  debounceMs?: number
}

export const VIEWPORT_DEBOUNCE_MS = 250

/**
 * The query for a view: its box rounded outward to 0.01° (so nearby views
 * share CDN cache entries, and the box always covers the screen), clamped to
 * the world, plus the kinds and retailers. A box over the API's limit
 * (MAX_BBOX_AREA; a very large screen at zoom 6) is shrunk around its center to fit.
 */
export function viewportQuery(map: ViewportMap, types: readonly LocationKind[], retailers: readonly string[] = []): string {
  const b = map.getBounds()
  let [w, s, e, n] = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()]
  const area = (e - w) * (n - s)
  if (area > MAX_BBOX_AREA) {
    // Leave room for the outward rounding below.
    const k = Math.sqrt((MAX_BBOX_AREA * 0.98) / area)
    const [cx, cy, hw, hh] = [(w + e) / 2, (s + n) / 2, ((e - w) * k) / 2, ((n - s) * k) / 2]
    ;[w, s, e, n] = [cx - hw, cy - hh, cx + hw, cy + hh]
  }
  const down = (v: number) => Math.floor(v * 100) / 100
  const up = (v: number) => Math.ceil(v * 100) / 100
  const clamp = (v: number, limit: number) => Math.max(-limit, Math.min(limit, v))
  const bbox = [clamp(down(w), 180), clamp(down(s), 90), clamp(up(e), 180), clamp(up(n), 90)].join(",")
  const retailer = retailers.length ? `&retailer=${encodeURIComponent(retailers.join(","))}` : ""
  return `bbox=${bbox}&types=${types.join(",")}${retailer}`
}

const EMPTY: ViewportLocations = { features: [], status: "idle", truncated: false }

/**
 * Locations in the map's current view, from GET /api/locations?bbox=…, from
 * POINT_ZOOM up. Refetches when the map settles (`moveend`, debounced) and
 * when `types` change. Each new request aborts the one before it, so a quick
 * pan never ends on an earlier view's results.
 */
export function useViewportLocations(
  map: ViewportMap | undefined,
  { types, retailers, debounceMs = VIEWPORT_DEBOUNCE_MS }: ViewportOptions,
): ViewportLocations {
  const [state, setState] = useState<ViewportLocations>(EMPTY)
  const typesKey = types.join(",")
  const retailersKey = (retailers ?? []).join(",")
  // Read the latest filters from the listener without re-subscribing.
  const typesRef = useRef(types)
  typesRef.current = types
  const retailersRef = useRef(retailers ?? [])
  retailersRef.current = retailers ?? []

  useEffect(() => {
    if (!map) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let controller: AbortController | undefined

    const load = async () => {
      controller?.abort()
      if (map.getZoom() < POINT_ZOOM) {
        setState(EMPTY)
        return
      }
      const current = new AbortController()
      controller = current
      setState((s) => ({ ...s, status: "loading" }))
      try {
        const res = await fetch(`/api/locations?${viewportQuery(map, typesRef.current, retailersRef.current)}`, { signal: current.signal })
        if (!res.ok) throw new Error(`Failed to load locations (${res.status})`)
        const fc = (await res.json()) as LocationFeatureCollection
        if (current.signal.aborted) return
        setState({ features: fc.features, status: "ready", truncated: fc.truncated ?? false })
      } catch (err) {
        if (current.signal.aborted) return
        console.error("[map] couldn't load locations for this view", err)
        setState((s) => ({ ...s, status: "error" }))
      }
    }

    const schedule = () => {
      clearTimeout(timer)
      // Cancel a request for a view the map has already left.
      controller?.abort()
      timer = setTimeout(load, debounceMs)
    }

    load()
    map.on("moveend", schedule)
    return () => {
      map.off("moveend", schedule)
      clearTimeout(timer)
      controller?.abort()
    }
    // typesKey, retailersKey: refetch when the filters change.
  }, [map, debounceMs, typesKey, retailersKey])

  return state
}
