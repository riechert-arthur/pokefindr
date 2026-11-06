import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listUserReviews } from '@/server/services/reviews'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    const reviews = await listUserReviews(userId)
    return NextResponse.json({ reviews }, { status: 200 })
  } catch (err) {
    console.error('[api/my-reviews] failed to load reviews', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
