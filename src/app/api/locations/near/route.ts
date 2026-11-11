import { NextResponse, type NextRequest } from "next/server"
import { getLocationsNear } from "@/server/services/locations"
import { nearQuerySchema } from "@/lib/locations/search"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/near?lng=-122.3285&lat=47.6196&r=10&types=vending&retailer=QFC&limit=…
 *   Active locations within `r` miles (5, 10, 25 or 50), closest first, each
 *   with `distance` in miles, plus `counts` per kind and the `total`.
 */
export async function GET(request: NextRequest) {
  const blocked = await guardRoute(request, RATE_RULES.locations, { bots: true })
  if (blocked) return blocked
  const params = request.nextUrl.searchParams
  const parsed = nearQuerySchema.safeParse({
    lng: params.get("lng") ?? "",
    lat: params.get("lat") ?? "",
    r: params.get("r") ?? "",
    types: params.get("types") ?? undefined,
    retailer: params.get("retailer") ?? undefined,
    limit: params.get("limit") ?? undefined,
  })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return NextResponse.json({ error: `Invalid query. ${message}` }, { status: 400 })
  }
  try {
    const { lng, lat, r, types, retailer, limit } = parsed.data
    return NextResponse.json(await getLocationsNear({ center: [lng, lat], radiusMiles: r, types, retailers: retailer, limit }), {
      // Only the browser keeps it: a CDN copy would reach bots without BotID's check (#198).
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (err) {
    log.forRequest(request, "/api/locations/near").logError("api.failed", err, { step: "failed to load locations" })
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 })
  }
}
