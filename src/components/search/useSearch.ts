"use client"

import { useEffect, useState } from "react"
import { searchPlaces, type GeocodeResult } from "@/lib/geocode/client"
import { MIN_QUERY_LENGTH } from "@/lib/geocode/query"
import { roundPlace } from "@/lib/map/url-state"
import { LOCATION_KINDS, type LocationFeature, type LocationFeatureCollection, type LocationKind, type RegionCount } from "@/lib/types/locations"

/** Waits this long after the last keystroke before asking the server. */
export const SEARCH_DEBOUNCE_MS = 200
/** The radius, in miles, of the count beside each area, unless the caller names one. */
export const AREA_COUNT_RADIUS = 10
const AREA_LIMIT = 6
const LOCATION_LIMIT = 5

export interface AreaResult extends GeocodeResult {
  /** Locations of the shown kinds within the radius (in the state, for a state); null until counted, if counting failed, or for a state under a retailer filter. */
  count: number | null
}

export type SearchStatus = "idle" | "loading" | "ready" | "error"

export interface SearchResults {
  /** The query these results answer. */
  query: string
  status: SearchStatus
  areas: AreaResult[]
  locations: LocationFeature[]
}

const typesParam = (kinds: readonly LocationKind[]) => (kinds.length === LOCATION_KINDS.length ? null : kinds.join(","))

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`${url} failed (${res.status})`)
  return (await res.json()) as T
}

/** Region counts change only after an import, so one fetch serves every search on the page. */
let regionCounts: Promise<RegionCount[]> | null = null
function getRegionCounts(): Promise<RegionCount[]> {
  regionCounts ??= getJson<{ counts: RegionCount[] }>("/api/locations/aggregates", new AbortController().signal)
    .then((b) => b.counts)
    .catch((err) => {
      regionCounts = null
      throw err
    })
  return regionCounts
}

/** Test helper: forget the cached region counts. */
export function resetSearchCacheForTests() {
  regionCounts = null
}

interface CountFilter {
  kinds: readonly LocationKind[]
  retailers: readonly string[]
  radius: number
}

async function countAreas(areas: GeocodeResult[], { kinds, retailers, radius }: CountFilter, signal: AbortSignal): Promise<(number | null)[]> {
  const shown = new Set(kinds)
  const points = areas.filter((a) => a.kind !== "state")
  const params = new URLSearchParams({
    points: points.map((a) => `${roundPlace(a.lng)},${roundPlace(a.lat)}`).join(";"),
    r: String(radius),
  })
  const types = typesParam(kinds)
  if (types !== null) params.set("types", types)
  if (retailers.length) params.set("retailer", retailers.join(","))
  // The region counts aren't by retailer, so a filtered state goes uncounted.
  const countStates = !(retailers.length && shown.has("vending"))
  const [near, regions] = await Promise.all([
    points.length ? getJson<{ counts: number[] }>(`/api/locations/counts?${params}`, signal).then((b) => b.counts) : [],
    countStates && areas.some((a) => a.kind === "state") ? getRegionCounts() : [],
  ])
  let i = 0
  return areas.map((a) =>
    a.kind !== "state"
      ? (near[i++] ?? null)
      : countStates
        ? regions.filter((r) => r.country === "US" && r.region === a.state && shown.has(r.kind)).reduce((n, r) => n + r.count, 0)
        : null,
  )
}

const IDLE: SearchResults = { query: "", status: "idle", areas: [], locations: [] }

/**
 * Areas from the geocoder (/api/geocode) and, with `locations`, our own
 * places whose name or address matches (/api/locations/search), for the
 * search list. Asks 200 ms after the last keystroke, cancels the previous
 * request, then fills in each area's count. Results stay on screen while
 * the next query loads.
 */
export function useSearch(
  query: string,
  {
    kinds = LOCATION_KINDS,
    retailers = [],
    radius = AREA_COUNT_RADIUS,
    near,
    locations = false,
  }: {
    kinds?: readonly LocationKind[]
    /** Vending retailers to count and list, as the map's `retailer=`; all by default. */
    retailers?: readonly string[]
    /** Miles around each area to count: the radius a pick will open with. */
    radius?: number
    near?: [number, number]
    locations?: boolean
  } = {},
): SearchResults {
  const [results, setResults] = useState<SearchResults>(IDLE)
  const q = query.trim()
  const kindsKey = kinds.join(",")
  const retailersKey = retailers.join(",")
  const nearKey = near ? `${near[0].toFixed(1)},${near[1].toFixed(1)}` : ""

  useEffect(() => {
    if (q.length < MIN_QUERY_LENGTH) {
      setResults(IDLE)
      return
    }
    setResults((r) => ({ ...r, status: "loading" }))
    const controller = new AbortController()
    const { signal } = controller
    const shown = kindsKey ? (kindsKey.split(",") as LocationKind[]) : []
    const center = nearKey ? (nearKey.split(",").map(Number) as [number, number]) : undefined
    const shownRetailers = retailersKey ? retailersKey.split(",") : []
    const timer = setTimeout(async () => {
      try {
        const locationParams = new URLSearchParams({ q, limit: String(LOCATION_LIMIT) })
        const types = typesParam(shown)
        if (types !== null) locationParams.set("types", types)
        if (center) locationParams.set("near", center.join(","))
        if (shownRetailers.length) locationParams.set("retailer", shownRetailers.join(","))
        const [places, found] = await Promise.all([
          searchPlaces(q, { near: center, limit: AREA_LIMIT, signal }),
          locations && shown.length
            ? getJson<LocationFeatureCollection>(`/api/locations/search?${locationParams}`, signal).then((fc) => fc.features)
            : Promise.resolve([]),
        ])
        if (signal.aborted) return
        const areas = places.map((p) => ({ ...p, count: null }))
        setResults({ query: q, status: "ready", areas, locations: found })
        // Counts are extra: the list is usable without them.
        try {
          const counts = await countAreas(places, { kinds: shown, retailers: shownRetailers, radius }, signal)
          if (!signal.aborted) setResults((r) => (r.query === q ? { ...r, areas: r.areas.map((a, i) => ({ ...a, count: counts[i] })) } : r))
        } catch (err) {
          if (!signal.aborted) console.warn("[search] couldn't count locations near the results", err)
        }
      } catch (err) {
        if (signal.aborted) return
        console.error("[search] search failed", err)
        setResults({ query: q, status: "error", areas: [], locations: [] })
      }
    }, SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [q, kindsKey, retailersKey, radius, nearKey, locations])

  return results
}
