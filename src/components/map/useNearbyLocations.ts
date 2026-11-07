"use client"

import { useCallback, useEffect, useState } from "react"
import { LOCATION_KINDS, type LocationKind, type NearbyLocations } from "@/lib/types/locations"
import { roundPlace } from "@/lib/map/url-state"

export type NearbyStatus = "idle" | "loading" | "ready" | "error"

export interface NearbyState {
  status: NearbyStatus
  /** The last results; kept while the next ones load. */
  results: NearbyLocations | null
  /** Asks again (after an error). */
  reload: () => void
}

/** The place a list is for: its center and radius in miles. */
export interface NearbyPlace {
  lng: number
  lat: number
  radius: number
}

/**
 * The results list for a place: GET /api/locations/near for the shown kinds
 * and retailers. A new place, radius or filter cancels the request before it
 * and ignores its late answer.
 */
export function useNearbyLocations(
  place: NearbyPlace | null,
  kinds: readonly LocationKind[],
  retailers: readonly string[] | null,
): NearbyState {
  const [state, setState] = useState<Omit<NearbyState, "reload">>({ status: "idle", results: null })
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const lng = place ? roundPlace(place.lng) : null
  const lat = place ? roundPlace(place.lat) : null
  const radius = place?.radius ?? null
  const types = kinds.length === LOCATION_KINDS.length ? null : kinds.join(",")
  const retailer = retailers?.length ? retailers.join(",") : null

  useEffect(() => {
    if (lng === null || lat === null || radius === null) {
      setState({ status: "idle", results: null })
      return
    }
    const params = new URLSearchParams({ lng: String(lng), lat: String(lat), r: String(radius) })
    if (types !== null) params.set("types", types)
    if (retailer !== null) params.set("retailer", retailer)
    const controller = new AbortController()
    setState((s) => ({ ...s, status: "loading" }))
    fetch(`/api/locations/near?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/locations/near failed (${res.status})`)
        const results = (await res.json()) as NearbyLocations
        if (!controller.signal.aborted) setState({ status: "ready", results })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        console.error("[map] couldn't load the results list", err)
        setState((s) => ({ ...s, status: "error" }))
      })
    return () => controller.abort()
  }, [lng, lat, radius, types, retailer, attempt])

  return { ...state, reload }
}
