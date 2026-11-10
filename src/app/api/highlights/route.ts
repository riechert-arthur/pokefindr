import { NextResponse } from "next/server"
import { getHighlights } from "@/server/services/highlights"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"

export const dynamic = "force-dynamic"

/**
 * GET /api/highlights
 *   `{ hotspots, events }`: the cities with the most vending machines within
 *   15 mi, and the next published events, for the zoomed-out map.
 */
export async function GET(request: Request) {
  const blocked = await guardRoute(request, RATE_RULES.locations, { bots: true })
  if (blocked) return blocked
  try {
    return NextResponse.json(await getHighlights(), {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    })
  } catch (err) {
    console.error("[api/highlights] failed to load highlights", err)
    return NextResponse.json({ error: "Failed to load highlights" }, { status: 500 })
  }
}
