import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import { eventDateProblem, submissionSchema } from "@/lib/submissions/schemas"
import { createSubmission, listMySubmissions } from "@/server/services/submissions"
import { enqueueJob } from "@/server/lib/jobs/enqueue"

export const dynamic = "force-dynamic"

const bodySchema = z.object({ submission: submissionSchema, confirmDuplicate: z.boolean().optional() })

/** The first problem in a failed parse, as `field: message`, for the form to show. */
function firstIssue(error: z.ZodError) {
  const issue = error.issues[0]
  return { error: issue.message, field: issue.path.filter((p) => p !== "submission").join(".") || null }
}

/**
 * POST /api/submissions  { submission: { kind: "shop" | "event", … }, confirmDuplicate? }
 *   Adds a card shop or event for review; needs a session (middleware sets
 *   x-user-id). 201 { id } when stored; 409 { duplicates } when places of the
 *   same kind are within 150 m and `confirmDuplicate` isn't set; 400 { error,
 *   field } for invalid fields; 429 past the daily limit.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to add a place" }, { status: 401 })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json(firstIssue(body.error), { status: 400 })
  const { submission, confirmDuplicate } = body.data
  if (submission.kind === "event") {
    const problem = eventDateProblem(submission.startsAt, submission.endsAt)
    if (problem) return NextResponse.json(problem, { status: 400 })
  }
  try {
    const result = await createSubmission({ userId, input: submission, confirmDuplicate })
    if (result.status === "rate_limited") {
      return NextResponse.json({ error: "You've added the most places you can today. Try again tomorrow." }, { status: 429 })
    }
    if (result.status === "duplicate") {
      return NextResponse.json({ error: "This might already be on the map.", duplicates: result.duplicates }, { status: 409 })
    }
    // Moderators hear about it by email; a failure to queue doesn't lose the submission.
    await enqueueJob("submission-created", { submissionId: result.id }, { idempotencyKey: `submission-created:${result.id}` }).catch((err) =>
      console.error("[api/submissions] couldn't queue the email to moderators", err),
    )
    return NextResponse.json({ id: result.id, status: "pending" }, { status: 201 })
  } catch (err) {
    console.error("[api/submissions] failed to store the submission", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}

/**
 * GET /api/submissions?mine
 *   The signed-in person's submissions, newest first, with their status.
 *   `mine` is the only list there is; moderators use /api/admin/submissions.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to see your submissions" }, { status: 401 })
  if (!request.nextUrl.searchParams.has("mine")) return NextResponse.json({ error: "Add ?mine to list your submissions" }, { status: 400 })
  try {
    return NextResponse.json({ submissions: await listMySubmissions(userId) })
  } catch (err) {
    console.error("[api/submissions] failed to list submissions", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
