import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod/v3'
import { addReview } from '@/server/services/reviews'
import { apiError } from "@/server/api-error"
import { recheckSoon } from '@/server/services/review-moderation'
import { limitClient, RATE_RULES } from '@/server/api-rate-limit'

const bodySchema = z.object({
  locationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  // A rating alone is a review; the text is optional, up to 500 characters.
  text: z.string().trim().max(500).default(''),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }
  const limited = await limitClient(req, RATE_RULES.reviews)
  if (limited) return limited

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Missing or invalid locationId / rating (1-5) / text (up to 500 characters)' }, { status: 400 })

  try {
    const added = await addReview({ ...parsed.data, userId })
    if (!added) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    if (added.checkFailed) recheckSoon()
    // `held`: it waits for a moderator, and only its author sees it (#253).
    return NextResponse.json({ success: true, id: added.id, status: added.status }, { status: 200 })
  } catch (err) {
    console.error('[api/reviews] failed to add review', err)
    return apiError("serverError", "Server error", 500)
  }
}
