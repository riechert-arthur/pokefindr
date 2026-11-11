import { NextResponse, type NextRequest } from "next/server"
import { searchLocations } from "@/server/services/locations"
import { searchQuerySchema } from "@/lib/locations/search"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/search?q=kroger&types=vending&near=-104.99,39.74&limit=5
 *   Active locations whose retailer, name, address or city contains `q`
 *   (or whose machine id is `q`), closest to `near` first, as a GeoJSON
 *   FeatureCollection.
 */
export async function GET(request: NextRequest) {
  const blocked = await guardRoute(request, RATE_RULES.locations, { bots: true })
  if (blocked) return blocked
  const params = request.nextUrl.searchParams
  const parsed = searchQuerySchema.safeParse({
    q: params.get("q") ?? "",
    types: params.get("types") ?? undefined,
    near: params.get("near") ?? undefined,
    retailer: params.get("retailer") ?? undefined,
    limit: params.get("limit") ?? undefined,
  })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return NextResponse.json({ error: `Invalid query. ${message}` }, { status: 400 })
  }
  try {
    const { retailer, ...query } = parsed.data
    return NextResponse.json(await searchLocations({ ...query, retailers: retailer }), {
      // Only the browser keeps it: a CDN copy would reach bots without BotID's check (#198).
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (err) {
    log.forRequest(request, "/api/locations/search").logError("api.failed", err, { step: "failed to search locations" })
    return NextResponse.json({ error: "Failed to search locations" }, { status: 500 })
  }
}
