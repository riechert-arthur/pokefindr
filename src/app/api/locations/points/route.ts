import { NextResponse } from "next/server"
import { getVendingPoints } from "@/server/services/locations"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/points
 *   `{ points: [lng, lat][] }`: every vending machine, rounded to 0.01°,
 *   for the landing page's background map. Changes only with imports.
 */
export async function GET() {
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
