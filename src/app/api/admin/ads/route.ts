import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { readPlacementFlags } from "@/server/services/ad-placements"
import { BANNERS } from "@/config/banners"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/** GET /api/admin/ads: each placement's switch, uncached, and the sponsors (#159). Admins only. */
export async function GET(request: NextRequest) {
  const staff = await requireEntitlement(request, "admin.ads")
  if (staff instanceof NextResponse) return staff
  try {
    return NextResponse.json({ placements: await readPlacementFlags(), sponsors: [...new Set(BANNERS.filter((b) => b.href && b.weight > 0).map((b) => b.sponsor))] }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    log.forRequest(request, "/api/admin/ads").logError("api.failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
