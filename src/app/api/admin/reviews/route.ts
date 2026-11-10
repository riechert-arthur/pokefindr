import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { listDecidedReviews, listHeldReviews } from "@/server/services/review-moderation"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/reviews
 *   `{ held, decided }`: reviews the automatic check held, oldest first, and
 *   what this moderator approved or removed in the last day (#253).
 *   Moderators and admins (404 for anyone else).
 */
export async function GET(request: NextRequest) {
  const staff = await requireEntitlement(request, "moderation.reviews")
  if (staff instanceof NextResponse) return staff
  try {
    const [held, decided] = await Promise.all([listHeldReviews(staff.userId), listDecidedReviews(staff.userId)])
    return NextResponse.json({ held, decided }, { headers: { "Cache-Control": "no-store" } })
  } catch (err) {
    console.error("[api/admin/reviews] failed to list", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
