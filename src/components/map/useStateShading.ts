"use client"

import { useEffect, useMemo, useState } from "react"
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson"
import type { LocationKind, RegionCount } from "@/lib/types/locations"
import { boundsOf, type LngLatBounds } from "@/lib/map/geo"

export type { LngLatBounds }

/** US state outlines (US Census, simplified), served from public/geo. */
export const STATES_URL = "/geo/us-states.json"

export interface StateProperties {
  name: string
  /** Two-letter code, matching `locations.state`. */
  region: string
  /** Locations of the shown kinds in this state. */
  count: number
}

export type StateFeature = Feature<Polygon | MultiPolygon, StateProperties>
export type StateCollection = FeatureCollection<Polygon | MultiPolygon, StateProperties>

/**
 * Sums `counts` per US state for the given kinds and writes them onto the
 * state outlines. Returns the outlines, the largest count (at least 1) and
 * the US total.
 */
export function shadeStates(
  outlines: StateCollection,
  counts: readonly RegionCount[],
  kinds: ReadonlySet<LocationKind>,
): { states: StateCollection; max: number; total: number } {
  const byRegion = new Map<string, number>()
  for (const c of counts) {
    if (c.country !== "US" || !kinds.has(c.kind)) continue
    byRegion.set(c.region, (byRegion.get(c.region) ?? 0) + c.count)
  }
  const states: StateCollection = {
    type: "FeatureCollection",
    features: outlines.features.map((f) => ({
      ...f,
      properties: { ...f.properties, count: byRegion.get(f.properties.region) ?? 0 },
    })),
  }
  let total = 0
  for (const n of byRegion.values()) total += n
  return { states, max: Math.max(1, ...byRegion.values()), total }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`)
  return (await res.json()) as T
}

/**
 * The state outlines, shaded by the region counts for `kinds` and
 * `retailers` (the map's filter), plus each state's bounds for zooming to
 * it. `states` is null until both have loaded; if either fails, the map just
 * goes without shading. A new retailer filter keeps the old counts until
 * the new ones arrive.
 */
export function useStateShading(kinds: ReadonlySet<LocationKind>, retailers: readonly string[] | null = null) {
  const [outlines, setOutlines] = useState<StateCollection | null>(null)
  const [counts, setCounts] = useState<RegionCount[] | null>(null)
  const retailer = retailers?.length ? retailers.join(",") : ""

  useEffect(() => {
    const controller = new AbortController()
    getJson<StateCollection>(STATES_URL, controller.signal)
      .then(setOutlines)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.error("[map] couldn't load the state outlines", err)
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const url = retailer ? `/api/locations/aggregates?${new URLSearchParams({ retailer })}` : "/api/locations/aggregates"
    getJson<{ counts: RegionCount[] }>(url, controller.signal)
      .then((agg) => setCounts(agg.counts))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) console.error("[map] couldn't load state shading", err)
      })
    return () => controller.abort()
  }, [retailer])

  const bounds = useMemo(() => {
    const out = new Map<string, LngLatBounds>()
    for (const f of outlines?.features ?? []) if (f.properties.region) out.set(f.properties.region, boundsOf(f.geometry))
    return out
  }, [outlines])

  const shaded = useMemo(
    () => (outlines && counts ? shadeStates(outlines, counts, kinds) : null),
    [outlines, counts, kinds],
  )

  // Each kind's US total, whatever is shown: the counts on the type chips.
  const kindTotals = useMemo(() => {
    if (!counts) return null
    const out: Partial<Record<LocationKind, number>> = {}
    for (const c of counts) if (c.country === "US") out[c.kind] = (out[c.kind] ?? 0) + c.count
    return out
  }, [counts])

  return { states: shaded?.states ?? null, max: shaded?.max ?? 1, total: shaded?.total ?? null, bounds, kindTotals }
}
