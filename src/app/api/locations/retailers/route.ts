import { NextResponse } from "next/server"
import { getTopRetailers } from "@/server/services/region-counts"
import { limitClient, RATE_RULES } from "@/server/api-rate-limit"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/retailers
 *   `{ retailers: { retailer, count }[] }`: the 12 vending retailers with the
 *   most active machines in the US, for the map's filter. Changes only with
 *   imports, so the CDN keeps it for an hour.
 */
export async function GET(request: Request) {
  const limited = await limitClient(request, RATE_RULES.locations)
  if (limited) return limited
  try {
    return NextResponse.json({ retailers: await getTopRetailers() }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } })
  } catch (err) {
    console.error("[api/locations/retailers] failed to load retailers", err)
    return NextResponse.json({ error: "Failed to load retailers" }, { status: 500 })
  }
}
