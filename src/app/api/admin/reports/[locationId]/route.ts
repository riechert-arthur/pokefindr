import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { REPORT_ACTIONS } from "@/lib/locations/reports"
import { requireEntitlement } from "@/server/admin/access"
import { enqueueJob } from "@/server/lib/jobs/enqueue"
import { actOnReports } from "@/server/services/report-admin"

export const dynamic = "force-dynamic"

const bodySchema = z.object({ action: z.enum(REPORT_ACTIONS) })
const idSchema = z.string().uuid()

const ANSWERS = {
  not_found: [404, "Location not found"],
  nothing_open: [409, "Its reports were already handled. Refresh to see what changed."],
  nothing_to_reopen: [409, "There's nothing to reopen."],
} as const

/**
 * POST /api/admin/reports/:locationId  { action: dismiss | fix | hide | reopen }
 *   Acts on a location's reports (#153). Hiding or bringing a location back
 *   also refreshes the map's region counts. Moderators and admins.
 */
export async function POST(request: NextRequest, context: { params: Promise<{ locationId: string }> }) {
  const staff = await requireEntitlement(request, "moderation.decide")
  if (staff instanceof NextResponse) return staff
  const id = idSchema.safeParse((await context.params).locationId)
  if (!id.success) return NextResponse.json({ error: "Location not found" }, { status: 404 })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: `action must be one of ${REPORT_ACTIONS.join(", ")}` }, { status: 400 })
  try {
    const result = await actOnReports(id.data, body.data.action, staff.userId)
    if (result.status !== "done") {
      const [status, error] = ANSWERS[result.status]
      return NextResponse.json({ error }, { status })
    }
    if (body.data.action === "hide" || body.data.action === "reopen") {
      // The state and region counts are a materialized view: refresh it so they match the map.
      await enqueueJob("refresh-region-counts", {}).catch((err) => console.error("[api/admin/reports] couldn't queue the counts refresh", err))
    }
    return NextResponse.json({ ok: true, reports: result.reports })
  } catch (err) {
    console.error("[api/admin/reports] failed to act", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
