import { NextResponse, type NextRequest } from "next/server"
import { getGeocoder } from "@/server/container"
import { GeocoderError } from "@/server/ports/geocoder"
import { geocodeQuerySchema } from "@/lib/geocode/query"
import { clientIp, tokenBucket } from "@/server/lib/rate-limit"

// Answers vary by query; the CDN caches each one (below).
export const dynamic = "force-dynamic"

/** Type-ahead sends a request every few keystrokes: room for fast typing, not for scraping. */
const limiter = tokenBucket({ perMinute: 60, burst: 20 })

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
  if (!limiter.take(clientIp(request.headers))) {
    return NextResponse.json({ error: "Too many searches. Try again in a minute." }, { status: 429, headers: { "Retry-After": "60" } })
  }

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
    console.error("[api/geocode] search failed", err)
    const status = err instanceof GeocoderError && err.status === 429 ? 503 : 502
    return NextResponse.json({ error: "Search is unavailable right now" }, { status })
  }
}
