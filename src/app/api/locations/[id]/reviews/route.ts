import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { getPanelReviews } from "@/server/services/reviews"
import { viewerId } from "@/server/auth/viewer"
import { limitClient, RATE_RULES } from "@/server/api-rate-limit"

export const dynamic = "force-dynamic"

const idSchema = z.string().uuid()
type Context = { params: Promise<{ id: string }> }

/**
 * GET /api/locations/<id>/reviews
 *   `{ reviews, count, average }`, newest first. Each review says whether
 *   it's the signed-in viewer's own (`mine`), so the response is private.
 */
export async function GET(request: NextRequest, context: Context) {
  const limited = await limitClient(request, RATE_RULES.locations)
  if (limited) return limited
  const parsed = idSchema.safeParse((await context.params).id)
  if (!parsed.success) return NextResponse.json({ error: "Not a location id" }, { status: 400 })
  try {
    return NextResponse.json(await getPanelReviews(parsed.data, await viewerId(request)), { headers: { "Cache-Control": "private, no-store" } })
  } catch (err) {
    console.error("[api/locations/id/reviews] failed to load reviews", err)
    return NextResponse.json({ error: "Failed to load reviews" }, { status: 500 })
  }
}
