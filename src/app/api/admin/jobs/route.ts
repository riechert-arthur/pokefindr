import { NextResponse, type NextRequest } from "next/server"
import { requireStaff } from "@/server/admin/access"
import { listJobs } from "@/server/services/admin-jobs"

export const dynamic = "force-dynamic"

/** GET /api/admin/jobs: each job with its last run and pause state (#157). Admins only. */
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request, "admin")
  if (staff instanceof NextResponse) return staff
  try {
    return NextResponse.json({ jobs: await listJobs() }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[api/admin/jobs] failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
