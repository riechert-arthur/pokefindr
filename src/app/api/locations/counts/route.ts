import { NextResponse, type NextRequest } from "next/server"
import { countLocationsNear } from "@/server/services/locations"
import { countsQuerySchema } from "@/lib/locations/search"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/counts?points=-104.99,39.74;-97.13,33.21&r=10&types=vending&retailer=QFC
 *   `{ counts: number[] }`: active locations within `r` miles (5, 10, 25 or
 *   50) of each point, in order; `retailer` filters vending machines only. For the counts beside each search result.
 */
export async function GET(request: NextRequest) {
  const blocked = await guardRoute(request, RATE_RULES.locations)
  if (blocked) return blocked
  const params = request.nextUrl.searchParams
  const parsed = countsQuerySchema.safeParse({
    points: params.get("points") ?? "",
    r: params.get("r") ?? "",
    types: params.get("types") ?? undefined,
    retailer: params.get("retailer") ?? undefined,
  })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return NextResponse.json({ error: `Invalid query. ${message}` }, { status: 400 })
  }
  try {
    const { points, r, types, retailer } = parsed.data
    return NextResponse.json(
      { counts: await countLocationsNear(points, r, types, retailer) },
      // Callers round the points (geocoder results are stable), so these share CDN entries.
      { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } },
    )
  } catch (err) {
    log.forRequest(request, "/api/locations/counts").logError("api.failed", err, { step: "failed to count locations" })
    return NextResponse.json({ error: "Failed to count locations" }, { status: 500 })
  }
}
