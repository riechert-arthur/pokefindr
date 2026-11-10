import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { listReportedLocations } from "@/server/services/report-admin"

export const dynamic = "force-dynamic"

/** GET /api/admin/reports: reported locations (#153). Moderators and admins. */
export async function GET(request: NextRequest) {
  const staff = await requireEntitlement(request, "moderation.view")
  if (staff instanceof NextResponse) return staff
  try {
    return NextResponse.json({ locations: await listReportedLocations() }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[api/admin/reports] failed to list", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
