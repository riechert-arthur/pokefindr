import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { z } from 'zod'
import { listLocationReviews } from '@/server/services/reviews'

const locationIdSchema = z.string().uuid()

export async function GET(req: NextRequest) {
  const parsed = locationIdSchema.safeParse(req.nextUrl.searchParams.get('locationId'))
  if (!parsed.success)
    return NextResponse.json({ error: 'locationId query param must be a location id' }, { status: 400 })

  try {
    const reviews = await listLocationReviews(parsed.data)
    return NextResponse.json({ reviews }, { status: 200 })
  } catch (err) {
    console.error('[api/get-reviews] failed to load reviews', err)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
