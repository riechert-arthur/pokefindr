import { NextResponse, type NextRequest } from "next/server"
import { apiError } from "@/server/api-error"
import { limitClient, RATE_RULES } from "@/server/api-rate-limit"
import { refuseCrossSite } from "@/server/auth/identity"
import { getImageStore } from "@/server/container"
import type { ImageStore } from "@/server/ports/image-store"
import { AvatarError, removeAvatar, setAvatar, type AvatarRefusal } from "@/server/services/avatars"
import { AVATAR_MAX_BYTES } from "@/lib/avatars"

export const dynamic = "force-dynamic"
// sharp needs Node, not the edge runtime.
export const runtime = "nodejs"

const REFUSED: Record<AvatarRefusal, number> = { avatarTooLarge: 413, avatarWrongType: 415, avatarRejected: 422 }
/** Room for the multipart boundaries and headers around the file. */
const FORM_OVERHEAD = 16 * 1024

/** The checks both methods run first: same site, signed in, under the rate limit, uploads on. */
async function guard(req: NextRequest): Promise<{ response: Response } | { userId: string; store: ImageStore | null }> {
  const refused = refuseCrossSite(req)
  if (refused) return { response: refused }
  const userId = req.headers.get("x-user-id")
  if (!userId) return { response: apiError("loginRequired", "Unauthenticated", 401) }
  const limited = await limitClient(req, RATE_RULES.avatar, `user:${userId}`)
  if (limited) return { response: limited }
  return { userId, store: getImageStore() }
}

/**
 * POST /api/user-settings/avatar  (multipart form, `file`)
 *   Sets the signed-in user's profile picture (#290): JPEG, PNG or WebP up to
 *   2 MB, judged by the file's bytes, stored as a 256×256 WebP without
 *   metadata. Replaces (and deletes) the previous one. Answers { image }.
 */
export async function POST(req: NextRequest): Promise<Response> {
  const g = await guard(req)
  if ("response" in g) return g.response
  if (!g.store) return apiError("avatarsUnavailable", "Profile pictures aren't available right now.", 503)

  // Refuse an oversized body before reading it.
  if (Number(req.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES + FORM_OVERHEAD)
    return apiError("avatarTooLarge", "That file is over 2 MB. Choose a smaller photo.", 413)
  const form = await req.formData().catch(() => null)
  const file = form?.get("file")
  if (!(file instanceof Blob)) return apiError("invalidInput", "Attach a photo as `file`.", 400)
  if (file.size > AVATAR_MAX_BYTES) return apiError("avatarTooLarge", "That file is over 2 MB. Choose a smaller photo.", 413)

  try {
    const image = await setAvatar(g.userId, new Uint8Array(await file.arrayBuffer()), g.store)
    if (!image) return apiError("accountNotFound", "Account not found", 404)
    return NextResponse.json({ image })
  } catch (err) {
    if (err instanceof AvatarError) return apiError(err.code, err.message, REFUSED[err.code])
    console.error("[api/user-settings/avatar] upload failed", err)
    return apiError("serverError", "Something went wrong on our side. Try again.", 500)
  }
}

/** DELETE /api/user-settings/avatar: back to initials, and the stored file is deleted. */
export async function DELETE(req: NextRequest): Promise<Response> {
  const g = await guard(req)
  if ("response" in g) return g.response
  if (!(await removeAvatar(g.userId, g.store))) return apiError("accountNotFound", "Account not found", 404)
  return NextResponse.json({ image: null })
}
