import { NextResponse, type NextRequest } from "next/server"
import { isModerator, listDecided, listQueue } from "@/server/services/moderation"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/submissions
 *   The review queue (pending, oldest first, with automatic checks) and what
 *   this moderator decided in the last day. Moderators and admins only.
 */
export async function GET(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  try {
    if (!(await isModerator(userId))) return NextResponse.json({ error: "Only moderators can see the review queue" }, { status: 403 })
    const [queue, decided] = await Promise.all([listQueue(userId), listDecided(userId)])
    return NextResponse.json({ queue, decided })
  } catch (err) {
    console.error("[api/admin/submissions] failed to load the queue", err)
    return NextResponse.json({ error: "Server error" }, { status: 500 })
  }
}
