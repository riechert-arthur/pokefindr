import { NextResponse, type NextRequest } from "next/server"
import { getTopCities } from "@/server/services/locations"
import { citiesQuerySchema } from "@/lib/locations/search"

export const dynamic = "force-dynamic"

/**
 * GET /api/locations/cities?state=WA&types=vending&retailer=QFC
 *   The state's 30 cities with the most locations (most first, each at the
 *   middle of its locations), plus `counts` per kind and the `total`.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams
  const parsed = citiesQuerySchema.safeParse({
    state: params.get("state") ?? "",
    types: params.get("types") ?? undefined,
    retailer: params.get("retailer") ?? undefined,
  })
  if (!parsed.success) {
    const message = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
    return NextResponse.json({ error: `Invalid query. ${message}` }, { status: 400 })
  }
  try {
    const { state, types, retailer } = parsed.data
    return NextResponse.json(await getTopCities(state, types, undefined, undefined, retailer), {
      // Changes only with imports and contributions; the region counts view refreshes nightly.
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" },
    })
  } catch (err) {
    console.error("[api/locations/cities] failed to load cities", err)
    return NextResponse.json({ error: "Failed to load cities" }, { status: 500 })
  }
}
