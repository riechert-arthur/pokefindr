import { NextResponse, type NextRequest } from "next/server"
import { getActiveLocationsGeoJSON, getLocationsInBbox } from "@/server/services/locations"
import { bboxQuerySchema } from "@/lib/locations/bbox"

// Never prerendered or kept in the Next.js data cache: the location import runs
// outside Next.js and couldn't clear it. The short CDN cache below is the only
// cache, so the map trails the database by about a minute at most.
export const dynamic = "force-dynamic"

/**
 * GET /api/locations?bbox=west,south,east,north&types=vending,shop
 *   Active locations in the box (at most 2,000; `truncated` says when there
 *   were more). Without `types`, every kind.
 * GET /api/locations
 *   Every active location. The map uses this until it loads by viewport.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  try {
    if (!params.has("bbox")) {
      return NextResponse.json(await getActiveLocationsGeoJSON(), {
        // Absorbs traffic spikes: about one database query per minute per region.
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
      })
    }

    const parsed = bboxQuerySchema.safeParse({
      bbox: params.get("bbox"),
      types: params.get("types") ?? undefined,
    })
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      return NextResponse.json({ error: `Invalid query. ${message}` }, { status: 400 })
    }

    return NextResponse.json(await getLocationsInBbox(parsed.data), {
      // Short, so a pan lands on fresh data; clients round the box so nearby
      // views share cache entries.
      headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=120" },
    })
  } catch (err) {
    console.error("[api/locations] failed to load locations", err)
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 })
  }
}
