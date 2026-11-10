import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { listUserReviews } from '@/server/services/reviews'
import { apiError } from "@/server/api-error"
import { log } from "@/server/log"

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  try {
    const reviews = await listUserReviews(userId)
    return NextResponse.json({ reviews }, { status: 200 })
  } catch (err) {
    log.forRequest(req, "/api/my-reviews").logError("api.failed", err, { step: "failed to load reviews" })
    return apiError("serverError", "Server error", 500)
  }
}
