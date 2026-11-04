import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { reviewSchema } from '@/lib/schemas'
import { getSessionUserId } from '@/server/auth/request'
import { deleteReview, isUuid, updateReview } from '@/server/services/reviews'

type Context = { params: Promise<{ id: string }> }

const notFound = () => NextResponse.json({ error: 'Review not found' }, { status: 404 })

export async function DELETE(req: NextRequest, context: Context) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { id } = await context.params
  if (!isUuid(id)) return notFound()

  const deleted = await deleteReview({ reviewId: id, userId })
  return deleted ? NextResponse.json({ success: true }) : notFound()
}

export async function PATCH(req: NextRequest, context: Context) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  const { id } = await context.params
  if (!isUuid(id)) return notFound()

  const parsed = reviewSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(', ') },
      { status: 400 },
    )
  }

  const review = await updateReview({ reviewId: id, userId, ...parsed.data })
  return review ? NextResponse.json({ success: true, review }) : notFound()
}
