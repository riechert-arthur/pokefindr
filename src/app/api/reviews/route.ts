import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { addReview } from '@/server/services/reviews'

const bodySchema = z.object({
  locationId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(1),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success)
    return NextResponse.json({ error: 'Missing or invalid locationId / rating / text' }, { status: 400 })

  try {
    const added = await addReview({ ...parsed.data, userId })
    if (!added) return NextResponse.json({ error: 'Location not found' }, { status: 404 })
    return NextResponse.json({ success: true }, { status: 200 })
  } catch (err) {
    console.error('[api/reviews] failed to add review', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
