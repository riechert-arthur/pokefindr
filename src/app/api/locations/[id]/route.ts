import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { getLocationFeature } from "@/server/services/locations"
import { refuseBots } from "@/server/bot-check"

export const dynamic = "force-dynamic"

const idSchema = z.string().uuid()
type Context = { params: Promise<{ id: string }> }

/**
 * GET /api/locations/<id>
 *   One active location as a GeoJSON Feature, for the details panel when
 *   the map hasn't loaded it (a link to a place outside the view, Back or
 *   Forward). 404 when there's no active location with that id.
 */
export async function GET(_request: NextRequest, context: Context) {
  const refused = await refuseBots()
  if (refused) return refused
  const parsed = idSchema.safeParse((await context.params).id)
  if (!parsed.success) return NextResponse.json({ error: "Not a location id" }, { status: 400 })
  try {
    const feature = await getLocationFeature(parsed.data)
    if (!feature) return NextResponse.json({ error: "Location not found" }, { status: 404 })
    return NextResponse.json(feature, { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=3600" } })
  } catch (err) {
    console.error("[api/locations/id] failed to load the location", err)
    return NextResponse.json({ error: "Failed to load the location" }, { status: 500 })
  }
}
