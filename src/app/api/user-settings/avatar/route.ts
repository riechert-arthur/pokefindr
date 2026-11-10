import { NextResponse, type NextRequest } from "next/server"
import { apiError } from "@/server/api-error"
import { limitClient, RATE_RULES } from "@/server/api-rate-limit"
import { refuseCrossSite } from "@/server/auth/identity"
import { getImageStore } from "@/server/container"
import type { ImageStore } from "@/server/ports/image-store"
import { AvatarError, removeAvatar, setAvatar, tooLarge, type AvatarRefusal } from "@/server/services/avatars"
import { AVATAR_MAX_BYTES } from "@/lib/avatars"
import { log } from "@/server/log"

export const dynamic = "force-dynamic"
// sharp needs Node, not the edge runtime.
export const runtime = "nodejs"

const REFUSED: Record<AvatarRefusal, number> = { avatarTooLarge: 413, avatarWrongType: 415, avatarRejected: 422 }
/** Room for the multipart boundaries and headers around the file. */
const FORM_OVERHEAD = 16 * 1024
const MAX_BODY = AVATAR_MAX_BYTES + FORM_OVERHEAD

/**
 * The request body, or null once it passes `limit` bytes. Read here, not by
 * req.formData(), which would buffer a chunked body (no Content-Length) of any size.
 */
async function readBody(req: NextRequest, limit: number): Promise<Uint8Array | null> {
  if (!req.body) return new Uint8Array()
  const reader = req.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > limit) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  const body = new Uint8Array(total)
  let at = 0
  for (const c of chunks) {
    body.set(c, at)
    at += c.byteLength
  }
  return body
}

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

  try {
    // Refuse an oversized body without reading it when it says its size, and stop reading when it doesn't.
    if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) throw tooLarge()
    const body = await readBody(req, MAX_BODY)
    if (!body) throw tooLarge()
    const form = await new Response(body, { headers: { "content-type": req.headers.get("content-type") ?? "" } }).formData().catch(() => null)
    const file = form?.get("file")
    if (!(file instanceof Blob)) return apiError("invalidInput", "Attach a photo as `file`.", 400)

    const image = await setAvatar(g.userId, new Uint8Array(await file.arrayBuffer()), g.store)
    if (!image) return apiError("accountNotFound", "Account not found", 404)
    return NextResponse.json({ image })
  } catch (err) {
    if (err instanceof AvatarError) return apiError(err.code, err.message, REFUSED[err.code])
    log.forRequest(req, "/api/user-settings/avatar").logError("avatar.upload_failed", err)
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
