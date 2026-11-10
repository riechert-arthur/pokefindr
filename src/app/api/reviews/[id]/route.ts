import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod/v3'
import { deleteReview, updateReview } from '@/server/services/reviews'
import { apiError } from "@/server/api-error"
import { recheckSoon } from '@/server/services/review-moderation'
import { limitClient, RATE_RULES } from '@/server/api-rate-limit'
import { log } from "@/server/log"

const reviewIdSchema = z.string().uuid()
const patchSchema = z.object({
  text: z.string().trim().max(500),
  rating: z.number().int().min(1).max(5),
})

type Context = { params: Promise<{ id: string }> }

export async function DELETE(req: NextRequest, context: Context) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
  const reviewId = reviewIdSchema.safeParse((await context.params).id)
  if (!reviewId.success) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  try {
    const deleted = await deleteReview(reviewId.data, userId)
    if (!deleted) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    return NextResponse.json({ success: true })
  } catch (err) {
    log.forRequest(req, "/api/reviews/[id]").logError("db.write_failed", err, { write: "review", step: "failed to delete review" })
    return apiError("serverError", "Server error", 500)
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
  const limited = await limitClient(req, RATE_RULES.reviews)
  if (limited) return limited
  const reviewId = reviewIdSchema.safeParse((await context.params).id)
  if (!reviewId.success) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  const body = patchSchema.safeParse(await req.json().catch(() => null))
  if (!body.success) {
    return NextResponse.json(
      { error: 'Request must include text (up to 500 characters) and rating (1-5)' },
      { status: 400 },
    )
  }

  try {
    const updated = await updateReview(reviewId.data, userId, body.data)
    if (!updated) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
    if (updated.checkFailed) recheckSoon()
    // The text is checked again: `held` means it waits for a moderator (#253).
    return NextResponse.json({ success: true, status: updated.status })
  } catch (err) {
    log.forRequest(req, "/api/reviews/[id]").logError("db.write_failed", err, { write: "review", step: "failed to update review" })
    return apiError("serverError", "Server error", 500)
  }
}
