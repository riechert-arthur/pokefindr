import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"
import { getRouteStops, MAX_STOPS, streetRoute } from "@/server/services/street-routes"

// Answers vary by ids; the CDN caches each one (below).
export const dynamic = "force-dynamic"

const idsSchema = z
  .string()
  .transform((s) => s.split(","))
  .pipe(z.array(z.string().uuid()).min(2).max(MAX_STOPS))

/**
 * GET /api/route?ids=a,b,c
 *   An assistant route along the streets (#288): `StreetRoute`, with the
 *   stops in the order given. Takes place ids only, never coordinates, so
 *   it's no free router for any address (docs/scraping.md). Ids that aren't
 *   active places are skipped; with fewer than 2 left it's a 404. When the
 *   router fails, is slow or is over its daily cap, the line is straight and
 *   `routed` is false.
 */
export async function GET(request: NextRequest) {
  // Limits first, so malformed requests spend tokens too.
  const blocked = await guardRoute(request, RATE_RULES.route, { bots: true })
  if (blocked) return blocked
  const parsed = idsSchema.safeParse(request.nextUrl.searchParams.get("ids") ?? "")
  if (!parsed.success) return NextResponse.json({ error: `Invalid query. ids: 2 to ${MAX_STOPS} place ids, comma-separated` }, { status: 400 })

  let stops
  try {
    stops = await getRouteStops(parsed.data)
  } catch (err) {
    console.error("[api/route] failed to load the stops", err)
    return NextResponse.json({ error: "Failed to load the route" }, { status: 500 })
  }
  if (stops.length < 2) return NextResponse.json({ error: "Route not found" }, { status: 404 })

  try {
    const route = await streetRoute(stops, { signal: request.signal })
    const body = { routed: route.routed, line: route.line, legs: route.legs, miles: route.miles, minutes: route.minutes, stops: route.stops }
    return NextResponse.json(body, {
      headers: {
        // The same ids give the same route: a day at the CDN, and stale for
        // at most an hour more, so a closed or moved place drops out within
        // about a day. Straight lines only briefly, so the streets come back
        // once the router does.
        "Cache-Control": route.routed ? "public, s-maxage=86400, stale-while-revalidate=3600" : "public, s-maxage=300",
      },
    })
  } catch (err) {
    if (request.signal.aborted) return new NextResponse(null, { status: 499 })
    throw err
  }
}
