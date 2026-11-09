import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { FEEDBACK_REASONS } from "@/server/db/schema"
import { saveFeedback } from "@/server/assistant/feedback"
import { tokenBucket } from "@/server/lib/rate-limit"
import { apiError } from "@/server/api-error"

export const dynamic = "force-dynamic"

const bodySchema = z.object({
  turnId: z.string().uuid(),
  vote: z.enum(["up", "down"]),
  reason: z.enum(FEEDBACK_REASONS).nullish(),
  comment: z.string().max(500).nullish(),
})

// Votes are cheap, but not free to store: a generous per-user rate.
const limiter = tokenBucket({ perMinute: 30, burst: 30 })

/**
 * POST /api/assistant/feedback  { turnId, vote: "up" | "down", reason?, comment? }
 *   A thumbs up or down on one of the signed-in user's assistant answers
 *   (the done event's turnId). Voting again changes the vote. 404 for a turn
 *   that isn't theirs, 429 past 30 votes a minute.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  if (!limiter.take(userId)) return NextResponse.json({ error: "Too many votes. Wait a minute." }, { status: 429, headers: { "Retry-After": "60" } })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  try {
    const result = await saveFeedback({ userId, turnId: body.data.turnId, vote: body.data.vote === "up" ? 1 : -1, reason: body.data.reason, comment: body.data.comment })
    if (result === "not_found") return NextResponse.json({ error: "Answer not found" }, { status: 404 })
    return NextResponse.json({ saved: true })
  } catch (err) {
    console.error("[api/assistant/feedback] couldn't save", err)
    return apiError("serverError", "Server error", 500)
  }
}
