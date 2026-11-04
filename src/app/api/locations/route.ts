import { NextResponse } from "next/server"
import { unstable_cache } from "next/cache"
import { getActiveLocationsGeoJSON } from "@/server/services/locations"
import { LOCATIONS_CACHE_TAG } from "@/lib/types/locations"

// Served from the Next.js data cache. Writes that change the map call
// revalidateTag(LOCATIONS_CACHE_TAG), and the hourly revalidate is a backstop.
const getCachedLocations = unstable_cache(
  () => getActiveLocationsGeoJSON(),
  ["locations-geojson-v1"],
  { tags: [LOCATIONS_CACHE_TAG], revalidate: 3600 },
)

export async function GET() {
  try {
    const collection = await getCachedLocations()
    return NextResponse.json(collection, {
      headers: {
        // Short CDN cache: absorbs traffic spikes without hiding updates for long.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err) {
    console.error("[api/locations] failed to load locations", err)
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 })
  }
}
