import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { getCoverage } from "@/server/services/coverage"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/** GET /api/admin/coverage: where the map has locations (#156). Admins only. */
export async function GET(request: NextRequest) {
  const staff = await requireEntitlement(request, "admin.coverage")
  if (staff instanceof NextResponse) return staff
  try {
    return NextResponse.json(await getCoverage(), { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    log.forRequest(request, "/api/admin/coverage").logError("api.failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
