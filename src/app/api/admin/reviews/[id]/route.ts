import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireEntitlement } from "@/server/admin/access"
import { decideReview, type ReviewDecision } from "@/server/services/review-moderation"

export const dynamic = "force-dynamic"

const idSchema = z.string().uuid()
const bodySchema = z.object({ action: z.enum(["approve", "remove", "undo"]) })

const ANSWERS: Record<Exclude<ReviewDecision["status"], "done">, [number, string]> = {
  not_found: [404, "Review not found"],
  not_held: [409, "Someone already decided this one. Refresh to see what changed."],
  too_late: [409, "Only the moderator who decided can undo it, within an hour"],
  own: [403, "You wrote this one, so another moderator has to review it"],
}

/**
 * POST /api/admin/reviews/<id>  { action: "approve" | "remove" | "undo" }
 *   Approve publishes a held review; remove keeps it from everyone but its
 *   author; undo puts a decision from the last hour back in the queue
 *   (#253). Moderators and admins only (404 for anyone else).
 */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const staff = await requireEntitlement(request, "moderation.reviews")
  if (staff instanceof NextResponse) return staff
  const id = idSchema.safeParse((await context.params).id)
  if (!id.success) return NextResponse.json({ error: "Review not found" }, { status: 404 })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "action must be approve, remove or undo" }, { status: 400 })
  try {
    const result = await decideReview(id.data, body.data.action, staff.userId)
    if (result.status !== "done") {
      const [status, error] = ANSWERS[result.status]
      return NextResponse.json({ error }, { status })
    }
    return NextResponse.json({ ok: true, status: result.review })
  } catch (err) {
    console.error("[api/admin/reviews] failed to decide", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
