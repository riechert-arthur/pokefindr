import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireEntitlement } from "@/server/admin/access"
import { setPlacement } from "@/server/services/ad-placements"
import { SPONSOR_PLACEMENTS } from "@/config/banners"
import { audit, log } from "@/server/log"

export const dynamic = "force-dynamic"

/** POST /api/admin/ads/:placement  { enabled }: switches a placement on or off for everyone (#159). Admins only. */
export async function POST(request: NextRequest, context: { params: Promise<{ placement: string }> }) {
  const staff = await requireEntitlement(request, "admin.ads")
  if (staff instanceof NextResponse) return staff
  const placement = z.enum(SPONSOR_PLACEMENTS).safeParse((await context.params).placement)
  if (!placement.success) return NextResponse.json({ error: "Unknown placement" }, { status: 404 })
  const body = z.object({ enabled: z.boolean() }).safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "Send { enabled: true | false }" }, { status: 400 })
  try {
    await setPlacement(placement.data, body.data.enabled, staff.userId)
    audit(log.forRequest(request, "/api/admin/ads/[placement]"), "ads.set", { actorId: staff.userId, target: placement.data, outcome: body.data.enabled ? "enabled" : "disabled" })
    return NextResponse.json({ ok: true })
  } catch (err) {
    log.forRequest(request, "/api/admin/ads/[placement]").logError("api.failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
