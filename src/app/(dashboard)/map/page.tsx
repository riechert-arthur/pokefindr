import type { SearchParams } from "nuqs/server"
import { MapLoader } from "@/components/map/MapLoader"
import { loadMapSearchParams } from "@/lib/map/url-state"
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
 * Reads the map's state from the URL on the server, so a shared link opens
 * on the same place, state or location with no flash of the US view.
 */
export default async function MapPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await loadMapSearchParams(searchParams)
  const location = await sharedLocation(params.location)
  const [longitude, latitude] = location?.geometry.coordinates ?? []
  const view = initialMapView(params, location ? { longitude, latitude } : null)
  return <MapLoader view={view} location={location} />
}
