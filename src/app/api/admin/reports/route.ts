import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { listReportedLocations } from "@/server/services/report-admin"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/** GET /api/admin/reports: reported locations (#153). Moderators and admins. */
export async function GET(request: NextRequest) {
  const staff = await requireEntitlement(request, "moderation.view")
  if (staff instanceof NextResponse) return staff
  try {
    return NextResponse.json({ locations: await listReportedLocations() }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    log.forRequest(request, "/api/admin/reports").logError("api.failed", err, { step: "failed to list" })
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
