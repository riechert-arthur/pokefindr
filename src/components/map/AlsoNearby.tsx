"use client"

import { useEffect, useState } from "react"
import { LOCATION_KINDS, type LocationFeature, type LocationKind, type NearbyLocations } from "@/lib/types/locations"

/** A nearby place with its distance from the location, in miles. */
export type NearbyRow = NearbyLocations["features"][number]
import { roundPlace } from "@/lib/map/url-state"
import { LocationRow } from "./LocationRow"

/** How far "Also nearby" looks, in miles, and how many it lists. */
export const ALSO_NEARBY_MILES = 5
export const ALSO_NEARBY_COUNT = 3

/**
 * Up to three other places within 5 mi of a location, closest first, for
 * the shown kinds and retailers (GET /api/locations/near, the location
 * itself left out). Empty, loading or failed, it's an empty list.
 */
export function useAlsoNearby(
  location: { id: string; longitude: number; latitude: number },
  kinds: readonly LocationKind[],
  retailers: readonly string[] | null,
): NearbyRow[] {
  const [rows, setRows] = useState<NearbyRow[]>([])
  const { id, longitude, latitude } = location
  const types = kinds.length === LOCATION_KINDS.length ? null : kinds.join(",")
  const retailer = retailers?.length ? retailers.join(",") : null

  useEffect(() => {
    // One extra, since the location itself is usually the closest.
    const params = new URLSearchParams({ lng: String(roundPlace(longitude)), lat: String(roundPlace(latitude)), r: String(ALSO_NEARBY_MILES), limit: String(ALSO_NEARBY_COUNT + 1) })
    if (types !== null) params.set("types", types)
    if (retailer !== null) params.set("retailer", retailer)
    const controller = new AbortController()
    fetch(`/api/locations/near?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/locations/near failed (${res.status})`)
        const body = (await res.json()) as NearbyLocations
        if (!controller.signal.aborted) setRows(body.features.filter((f) => f.properties.id !== id).slice(0, ALSO_NEARBY_COUNT))
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        // A nice-to-have: the panel works without it.
        console.warn("[map] couldn't load nearby places", err)
        setRows([])
      })
    return () => controller.abort()
  }, [id, longitude, latitude, types, retailer])

  return rows
}

/** The panel's "Also nearby", as in the prototype: rows like the results list, which open that place. */
export function AlsoNearby({ rows, onOpen }: { rows: NearbyRow[]; onOpen: (feature: LocationFeature) => void }) {
  if (!rows.length) return null
  return (
    <section aria-labelledby="also-nearby-title" className="mt-5">
      <h3 id="also-nearby-title" className="mb-1 text-subheading text-foreground">
        Also nearby
      </h3>
      <ul className="-mx-2.5">
        {rows.map((f) => (
          <li key={f.properties.id}>
            <LocationRow feature={f} distance={f.properties.distance} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </section>
  )
}
