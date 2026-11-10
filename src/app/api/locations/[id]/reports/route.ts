import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { REPORT_REASONS } from "@/lib/locations/reports"
import { addLocationReport } from "@/server/services/reports"
import { apiError } from "@/server/api-error"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

const idSchema = z.string().uuid()
const bodySchema = z.object({
  reason: z.enum(REPORT_REASONS),
  comment: z.string().trim().max(500).optional(),
})
type Context = { params: Promise<{ id: string }> }

/**
 * POST /api/locations/<id>/reports  { reason, comment? }
 *   "Report a problem" from the details panel; needs a session (middleware
 *   sets x-user-id). 200 when stored or already reported today by this user,
 *   404 for an unknown location, 429 past the daily limit.
 */
export async function POST(request: NextRequest, context: Context) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })
  const id = idSchema.safeParse((await context.params).id)
  if (!id.success) return NextResponse.json({ error: "Location not found" }, { status: 404 })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: `reason must be one of ${REPORT_REASONS.join(", ")}` }, { status: 400 })
  try {
    const result = await addLocationReport({ locationId: id.data, userId, ...body.data })
    if (result === "not_found") return NextResponse.json({ error: "Location not found" }, { status: 404 })
    if (result === "rate_limited") return NextResponse.json({ error: "Too many reports today. Try again tomorrow." }, { status: 429 })
    return NextResponse.json({ success: true, duplicate: result === "duplicate" })
  } catch (err) {
    log.forRequest(request, "/api/locations/[id]/reports").logError("db.write_failed", err, { write: "status_report", step: "failed to store the report" })
    return apiError("serverError", "Server error", 500)
  }
}
