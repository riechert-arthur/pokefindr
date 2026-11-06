import { NextResponse } from "next/server"
import { getActiveLocationsGeoJSON } from "@/server/services/locations"

// Never prerendered or kept in the Next.js data cache: the location import runs
// outside Next.js and couldn't clear it. The short CDN cache below is the only
// cache, so the map trails the database by about a minute at most.
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const collection = await getActiveLocationsGeoJSON()
    return NextResponse.json(collection, {
      headers: {
        // Absorbs traffic spikes: about one database query per minute per region.
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    })
  } catch (err) {
    console.error("[api/locations] failed to load locations", err)
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 })
  }
}
