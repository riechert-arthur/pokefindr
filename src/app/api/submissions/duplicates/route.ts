import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { SUBMISSION_KINDS } from "@/lib/submissions/constants"
import { findDuplicates } from "@/server/services/submissions"

export const dynamic = "force-dynamic"

const querySchema = z.object({
  kind: z.enum(SUBMISSION_KINDS),
  lng: z.coerce.number().min(-180).max(180),
  lat: z.coerce.number().min(-90).max(90),
})

/**
 * GET /api/submissions/duplicates?kind=shop&lng=…&lat=…
 *   Places of that kind within 150 m of the point, for Add a place's
 *   location step to warn about before the details are filled in. Needs a
 *   session, so the map's data can't be swept through it without one.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to add a place" }, { status: 401 })
  const query = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!query.success) return NextResponse.json({ error: "kind, lng and lat are required" }, { status: 400 })
  try {
    return NextResponse.json({ duplicates: await findDuplicates({ ...query.data, userId }) })
  } catch (err) {
    console.error("[api/submissions/duplicates] failed", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
