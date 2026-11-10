import { NextResponse } from "next/server"
import { getVendingPoints } from "@/server/services/locations"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/points
 *   `{ points: [lng, lat][] }`: every vending machine, rounded to 0.01°,
 *   for the landing page's background map. Changes only with imports.
 */
export async function GET(request: Request) {
  const blocked = await guardRoute(request, RATE_RULES.locations)
  if (blocked) return blocked
  try {
    return NextResponse.json(
      { points: await getVendingPoints() },
      { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } },
    )
  } catch (err) {
    console.error("[api/locations/points] failed to load points", err)
    return NextResponse.json({ error: "Failed to load points" }, { status: 500 })
  }
}
