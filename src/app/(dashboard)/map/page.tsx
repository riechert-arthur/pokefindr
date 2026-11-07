import type { SearchParams } from "nuqs/server"
import { redirect } from "next/navigation"
import { MapLoader } from "@/components/map/MapLoader"
import { loadMapSearchParams, mapUrl, roundPlace, type MapSearchParams } from "@/lib/map/url-state"
import { getGeocoder } from "@/server/container"
import { initialMapView } from "@/lib/map/initial-view"
import { getLocationFeature } from "@/server/services/locations"
import type { LocationFeature } from "@/lib/types/locations"

export const metadata = {
  "title": "Find all Pokemon Vending Machine Locations Near You - Free Map | PokeFindr",
  "description": "See an interactive map with all the Pokemon Vending Machine locations near you. Easily send the directions to Google Maps and see reviews from others.",
  "keywords": [
    "Pokemon vending machines",
    "Pokemon map",
    "vending machine locations",
    "Pokemon merchandise map",
    "PokeFindr",
    "pokemon vending machines near me",
    "pokemon vending machine map",
    "nearest pokemon vending machines"
  ],
  "author": "PokeFindr Developer",
  "openGraph": {
    "title": "Find all Pokemon Vending Machine Locations Near You | PokeFindr",
    "description": "Explore a comprehensive map of Pokemon Vending Machine Locations. Easily find directions to your nearest vending machine!"
  }
}

/** Looks up the location a shared link names; the map opens without it if that fails. */
async function sharedLocation(id: string | null): Promise<LocationFeature | null> {
  if (!id) return null
  try {
    return await getLocationFeature(id)
  } catch (err) {
    console.error("[map] couldn't load the shared location", err)
    return null
  }
}

/**
 * A link with a place name but no coordinates (`/map?q=Seattle&r=10`, typed
 * or from another site): geocodes it once here and returns the full URL to
 * redirect to, so the map, the list and a copied link all have the point.
 * Null when there's nothing to resolve, or the name isn't found (the map
 * then opens on the US).
 */
async function resolvePlace(params: MapSearchParams): Promise<string | null> {
  const q = params.q?.trim()
  if (!q || (params.lat !== null && params.lng !== null) || params.near) return null
  try {
    const [found] = await getGeocoder().search(q, { limit: 1 })
    if (!found) return null
    if (found.kind === "state" && found.state) return mapUrl("/map", { ...params, q: null, lat: null, lng: null, state: found.state })
    return mapUrl("/map", { ...params, q: found.label, lat: roundPlace(found.lat), lng: roundPlace(found.lng) })
  } catch (err) {
    console.error("[map] couldn't geocode the linked place", err)
    return null
  }
}

/**
 * Reads the map's state from the URL on the server, so a shared link opens
 * on the same place, state or location with no flash of the US view.
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await loadMapSearchParams(searchParams)
  const resolved = await resolvePlace(params)
  if (resolved) redirect(resolved)
  const location = await sharedLocation(params.location)
  const [longitude, latitude] = location?.geometry.coordinates ?? []
  const view = initialMapView(params, location ? { longitude, latitude } : null)
  return <MapLoader view={view} location={location} />
}
