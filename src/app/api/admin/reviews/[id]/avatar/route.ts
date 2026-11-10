import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod/v3"
import { requireEntitlement } from "@/server/admin/access"
import { limitClient, RATE_RULES } from "@/server/api-rate-limit"
import { refuseCrossSite } from "@/server/auth/identity"
import { getImageStore } from "@/server/container"
import { removeAvatar, reviewerOf } from "@/server/services/avatars"

export const dynamic = "force-dynamic"

const idSchema = z.string().uuid()

/**
 * DELETE /api/admin/reviews/:id/avatar
 *   Removes the profile picture of the person who wrote review :id (#290), back
 *   to initials: pictures show publicly next to reviews. By review, not by
 *   username, so a rename can't point it at someone else. Needs
 *   moderation.avatars (moderators and admins), rate limited per staff member.
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const refused = refuseCrossSite(request)
  if (refused) return refused
  const staff = await requireEntitlement(request, "moderation.avatars")
  if (staff instanceof NextResponse) return staff
  const limited = await limitClient(request, RATE_RULES.avatarModeration, `staff:${staff.userId}`)
  if (limited) return limited
  const { id } = await context.params
  const userId = idSchema.safeParse(id).success ? await reviewerOf(id) : null
  if (!userId || !(await removeAvatar(userId, getImageStore()))) return NextResponse.json({ error: "Review not found" }, { status: 404 })
  console.info(`[api/admin/reviews/avatar] ${staff.userId} removed the picture of ${userId} (review ${id})`)
  return NextResponse.json({ ok: true })
}
