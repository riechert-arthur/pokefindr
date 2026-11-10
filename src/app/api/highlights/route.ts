import { NextResponse } from "next/server"
import { getHighlights } from "@/server/services/highlights"
import { refuseBots } from "@/server/bot-check"

export const dynamic = "force-dynamic"

/**
 * GET /api/highlights
 *   `{ hotspots, events }`: the cities with the most vending machines within
 *   15 mi, and the next published events, for the zoomed-out map.
 */
export async function GET() {
  const refused = await refuseBots()
  if (refused) return refused
  try {
    return NextResponse.json(await getHighlights(), {
      headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" },
    })
  } catch (err) {
    console.error("[api/highlights] failed to load highlights", err)
    return NextResponse.json({ error: "Failed to load highlights" }, { status: 500 })
  }
}
