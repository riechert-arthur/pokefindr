import { NextResponse, type NextRequest } from "next/server"
import { requireEntitlement } from "@/server/admin/access"
import { refuseCrossSite } from "@/server/auth/identity"
import { getImageStore } from "@/server/container"
import { removeAvatar, userIdForUsername } from "@/server/services/avatars"

export const dynamic = "force-dynamic"

/**
 * DELETE /api/admin/avatars/:username
 *   Removes someone's profile picture (#290), back to initials: pictures show
 *   publicly next to reviews. Needs moderation.avatars (moderators and admins).
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ username: string }> }) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const staff = await requireEntitlement(request, "moderation.avatars")
  if (staff instanceof NextResponse) return staff
  const userId = await userIdForUsername(decodeURIComponent((await context.params).username))
  if (!userId || !(await removeAvatar(userId, getImageStore()))) return NextResponse.json({ error: "User not found" }, { status: 404 })
  console.info(`[api/admin/avatars] ${staff.userId} removed the picture of ${userId}`)
  return NextResponse.json({ ok: true })
}
