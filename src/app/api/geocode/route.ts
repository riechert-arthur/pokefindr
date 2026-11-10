import { NextResponse, type NextRequest } from "next/server"
import { getGeocoder } from "@/server/container"
import { GeocoderError } from "@/server/ports/geocoder"
import { geocodeQuerySchema } from "@/lib/geocode/query"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"
import { log } from "@/server/log"

// Answers vary by query; the CDN caches each one (below).
export const dynamic = "force-dynamic"

/**
 * GET /api/geocode?q=Denver&near=-105.0,39.7&limit=5
 *   `{ results: GeocodeResult[] }` from the configured geocoder (#48). The
 *   provider and its key stay on the server.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const parsed = geocodeQuerySchema.safeParse({
    q: params.get("q") ?? "",
    near: params.get("near") ?? undefined,
    limit: params.get("limit") ?? undefined,
  })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return NextResponse.json({ error: `Invalid query. ${message}` }, { status: 400 })
  }
  const blocked = await guardRoute(request, RATE_RULES.geocode, { bots: true })
  if (blocked) return blocked

  const { q, near, limit } = parsed.data
  try {
    const results = await getGeocoder().search(q, { near, limit, signal: request.signal })
    return NextResponse.json(
      { results },
      // The same query gives the same places: cache for a day at the CDN.
      { headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" } },
    )
  } catch (err) {
    if (request.signal.aborted) return new NextResponse(null, { status: 499 })
    log.forRequest(request, "/api/geocode").logError("api.failed", err, { step: "search failed" })
    const status = err instanceof GeocoderError && err.status === 429 ? 503 : 502
    return NextResponse.json({ error: "Search is unavailable right now" }, { status })
  }
}
