import { NextResponse, type NextRequest } from "next/server"
import { getRegionCounts } from "@/server/services/region-counts"
import { retailerParam } from "@/lib/locations/search"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"

// Read at request time; the CDN cache below keeps that to about once an hour.
export const dynamic = "force-dynamic"

/**
 * GET /api/locations/aggregates?retailer=Safeway,QFC
 *   `{ counts: RegionCount[] }`: locations per country, region and kind, for
 *   the zoomed-out map. The view behind it changes only after an import or
 *   the nightly refresh, so the CDN keeps it for an hour. With `retailer`,
 *   vending machines count only for those retailers (as on the map).
 */
export async function GET(request: NextRequest) {
  const blocked = await guardRoute(request, RATE_RULES.locations)
  if (blocked) return blocked
  const retailers = retailerParam.parse(request.nextUrl.searchParams.get("retailer") ?? undefined)
  try {
    return NextResponse.json(
      { counts: await getRegionCounts(undefined, retailers) },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    )
  } catch (err) {
    console.error("[api/locations/aggregates] failed to load counts", err)
    return NextResponse.json({ error: "Failed to load counts" }, { status: 500 })
  }
}
