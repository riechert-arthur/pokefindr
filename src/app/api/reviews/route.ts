import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod/v3'
import { addReview } from '@/server/services/reviews'
import { apiError } from "@/server/api-error"
import { log } from "@/server/log"

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

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Missing or invalid locationId / rating (1-5) / text (up to 500 characters)' }, { status: 400 })

  try {
    const id = await addReview({ ...parsed.data, userId })
    if (!id) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    return NextResponse.json({ success: true, id }, { status: 200 })
  } catch (err) {
    log.forRequest(req, "/api/reviews").logError("db.write_failed", err, { write: "review", step: "failed to add review" })
    return apiError("serverError", "Server error", 500)
  }
}
