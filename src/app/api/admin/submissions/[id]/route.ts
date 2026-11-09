import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { REJECT_REASONS } from "@/lib/submissions/constants"
import { approveSubmission, isModerator, rejectSubmission, undoDecision, type DecisionResult } from "@/server/services/moderation"
import { REVIEWED_EMAIL_DELAY_SECONDS } from "@/server/services/submission-notifications"
import { enqueueJob } from "@/server/lib/jobs/enqueue"

export const dynamic = "force-dynamic"

const idSchema = z.string().uuid()
const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("approve") }),
  z.object({ action: z.literal("reject"), reason: z.enum(REJECT_REASONS) }),
  z.object({ action: z.literal("undo") }),
])
type Context = { params: Promise<{ id: string }> }

const ANSWERS: Record<Exclude<DecisionResult["status"], "done">, [number, string]> = {
  not_found: [404, "Submission not found"],
  not_pending: [409, "Someone already decided this one"],
  too_late: [409, "Only the moderator who decided can undo it, within an hour"],
  own: [403, "You sent this one, so another moderator has to review it"],
  in_use: [409, "People have already reviewed or reported this place, so undoing it would delete their posts"],
}

/**
 * POST /api/admin/submissions/<id>  { action: "approve" | "reject" | "undo", reason? }
 *   Approve puts the place on the map for everyone; reject needs a reason
 *   the submitter sees; undo puts a decision made in the last hour back in
 *   the queue. Moderators and admins only.
 */
export async function POST(request: NextRequest, context: Context) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  const id = idSchema.safeParse((await context.params).id)
  if (!id.success) return NextResponse.json({ error: "Submission not found" }, { status: 404 })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: `action must be approve, reject (with a reason: ${REJECT_REASONS.join(", ")}) or undo` }, { status: 400 })
  try {
    if (!(await isModerator(userId))) return NextResponse.json({ error: "Only moderators can review submissions" }, { status: 403 })
    const b = body.data
    const result =
      b.action === "approve" ? await approveSubmission(id.data, userId) : b.action === "reject" ? await rejectSubmission(id.data, userId, b.reason) : await undoDecision(id.data, userId)
    if (result.status !== "done") {
      const [status, error] = ANSWERS[result.status]
      return NextResponse.json({ error }, { status })
    }
    if (result.reviewedAt) {
      // The submitter hears in a few minutes, after the window where an undo is most likely.
      const reviewedAt = result.reviewedAt.toISOString()
      await enqueueJob("submission-reviewed", { submissionId: id.data, reviewedAt }, {
        idempotencyKey: `submission-reviewed:${id.data}:${reviewedAt}`,
        delaySeconds: REVIEWED_EMAIL_DELAY_SECONDS,
      }).catch((err) => console.error("[api/admin/submissions/id] couldn't queue the email to the submitter", err))
    }
    return NextResponse.json({ ok: true, locationId: result.locationId ?? null })
  } catch (err) {
    console.error("[api/admin/submissions/id] decision failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
