import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { getAdminSummary } from "@/server/services/admin-summary"

export const dynamic = "force-dynamic"

/** GET /api/admin/summary: the sidebar's counts and the summary cards (#158). Staff only; moderators get the Moderation counts only. */
export async function GET(request: NextRequest) {
  const staff = await requireEntitlement(request, "moderation.view")
  if (staff instanceof NextResponse) return staff
  try {
    return NextResponse.json(await getAdminSummary(staff.role), { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[api/admin/summary] failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
