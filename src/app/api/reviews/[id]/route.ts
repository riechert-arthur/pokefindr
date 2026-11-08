import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { deleteReview, updateReview } from '@/server/services/reviews'

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
    console.error('[api/reviews/:id] failed to delete review', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
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
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[api/reviews/:id] failed to update review', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
