import { NextResponse } from "next/server"
import { getRegionCounts } from "@/server/services/region-counts"

// Read at request time; the CDN cache below keeps that to about once an hour.
export const dynamic = "force-dynamic"

/**
 * GET /api/locations/aggregates
 *   `{ counts: RegionCount[] }`: locations per country, region and kind, for
 *   the zoomed-out map. The view behind it changes only after an import or
 *   the nightly refresh, so the CDN keeps it for an hour.
 */
export async function GET() {
  try {
    return NextResponse.json(
      { counts: await getRegionCounts() },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    )
  } catch (err) {
    console.error("[api/locations/aggregates] failed to load counts", err)
    return NextResponse.json({ error: "Failed to load counts" }, { status: 500 })
  }
}
