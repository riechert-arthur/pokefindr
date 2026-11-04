import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { unstable_cache } from "next/cache"
import { reviewSchema } from "@/lib/schemas"
import { getSessionUserId } from "@/server/auth/request"
import {
  NotFoundError,
  createReview,
  isUuid,
  listLocationReviews,
  locationReviewsTag,
} from "@/server/services/reviews"

type Context = { params: Promise<{ id: string }> }

/** Public: reviews and rating summary for one location. */
export async function GET(_req: NextRequest, context: Context) {
  const { id } = await context.params
  if (!isUuid(id)) return NextResponse.json({ error: "Location not found" }, { status: 404 })

  const load = unstable_cache(() => listLocationReviews(id), ["location-reviews-v1", id], {
    tags: [locationReviewsTag(id)],
    revalidate: 3600,
  })
  return NextResponse.json(await load())
}

/** Signed in: add a review to this location. */
export async function POST(req: NextRequest, context: Context) {
  const userId = getSessionUserId(req)
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const { id } = await context.params
  if (!isUuid(id)) return NextResponse.json({ error: "Location not found" }, { status: 404 })

  const parsed = reviewSchema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues.map((i) => i.message).join(", ") },
      { status: 400 },
    )
  }

  try {
    const review = await createReview({ locationId: id, userId, ...parsed.data })
    return NextResponse.json({ success: true, id: review.id }, { status: 201 })
  } catch (err) {
    if (err instanceof NotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 })
    }
    throw err
  }
}
