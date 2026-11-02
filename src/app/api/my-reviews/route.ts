import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getSessionUserId } from '@/server/auth/request'
import { listUserReviews } from '@/server/services/reviews'

export async function GET(req: NextRequest) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })

  try {
    return NextResponse.json({ reviews: await listUserReviews(userId) })
  } catch (err) {
    console.error('Error fetching reviews', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
