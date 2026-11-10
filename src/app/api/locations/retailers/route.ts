import { NextResponse } from "next/server"
import { getTopRetailers } from "@/server/services/region-counts"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/retailers
 *   `{ retailers: { retailer, count }[] }`: the 12 vending retailers with the
 *   most active machines in the US, for the map's filter. Changes only with
 *   imports, so the CDN keeps it for an hour.
 */
export async function GET(request: Request) {
  const blocked = await guardRoute(request, RATE_RULES.locations)
  if (blocked) return blocked
  try {
    return NextResponse.json({ retailers: await getTopRetailers() }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } })
  } catch (err) {
    log.forRequest(request, "/api/locations/retailers").logError("api.failed", err, { step: "failed to load retailers" })
    return NextResponse.json({ error: "Failed to load retailers" }, { status: 500 })
  }
}
