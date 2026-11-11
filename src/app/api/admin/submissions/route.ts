import { NextResponse, type NextRequest } from "next/server"
import { listDecided, listQueue } from "@/server/services/moderation"
import { requireEntitlement } from "@/server/admin/access"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/submissions
 *   The review queue (pending, oldest first, with automatic checks) and what
 *   this moderator decided in the last day. Moderators and admins only
 *   (404 for anyone else).
 */
export async function GET(request: NextRequest) {
  try {
    const staff = await requireEntitlement(request, "moderation.view")
    if (staff instanceof NextResponse) return staff
    const { userId } = staff
    const [queue, decided] = await Promise.all([listQueue(userId), listDecided(userId)])
    return NextResponse.json({ queue, decided })
  } catch (err) {
    log.forRequest(request, "/api/admin/submissions").logError("api.failed", err, { step: "failed to load the queue" })
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
