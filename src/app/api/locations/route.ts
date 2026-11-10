import { NextResponse, type NextRequest } from "next/server"
import { getLocationsInBbox } from "@/server/services/locations"
import { bboxQuerySchema } from "@/lib/locations/bbox"
import { guardRoute, RATE_RULES } from "@/server/api-rate-limit"

// Never prerendered or kept in the Next.js data cache: the location import runs
// outside Next.js and couldn't clear it. Browsers keep each answer 30 seconds
// (below), so the map trails the database by about that much.
export const dynamic = "force-dynamic"

/**
 * GET /api/locations?bbox=west,south,east,north&types=vending,shop
 *   Active locations in the box (at most 500 and 300 square degrees;
 *   `truncated` says when there were more). Without `types`, every kind.
 *   There's no way to ask for every location (#201, docs/scraping.md).
 */
export async function GET(request: NextRequest) {
  const blocked = await guardRoute(request, RATE_RULES.locations, { bots: true })
  if (blocked) return blocked
  const params = request.nextUrl.searchParams
  try {
    const parsed = bboxQuerySchema.safeParse({
      bbox: params.get("bbox"),
      types: params.get("types") ?? undefined,
      retailer: params.get("retailer") ?? undefined,
    })
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
      return NextResponse.json({ error: `Invalid query. ${message}` }, { status: 400 })
    }

    const { retailer, ...query } = parsed.data
    return NextResponse.json(await getLocationsInBbox({ ...query, retailers: retailer }), {
      // Only the browser keeps it: a CDN copy would reach bots without BotID's check (#198).
      headers: { "Cache-Control": "private, max-age=30" },
    })
  } catch (err) {
    console.error("[api/locations] failed to load locations", err)
    return NextResponse.json({ error: "Failed to load locations" }, { status: 500 })
  }
}
