import { NextResponse } from "next/server"
import { getPlacementFlags } from "@/server/services/ad-placements"
import { SPONSOR_PLACEMENTS } from "@/config/banners"

export const dynamic = "force-dynamic"

/**
 * GET /api/ads/placements: which sponsored placements are on (#159), for
 * the slots. Cached on the server until an admin flips a switch; browsers
 * and the CDN don't keep it, so a change shows on the next page load. If
 * the flags can't be read, every placement is off.
 */
export async function GET() {
  try {
    return NextResponse.json({ placements: await getPlacementFlags() }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[api/ads/placements] failed", err)
    return NextResponse.json({ placements: Object.fromEntries(SPONSOR_PLACEMENTS.map((p) => [p, false])) }, { headers: { "Cache-Control": "no-store" } })
  }
}
