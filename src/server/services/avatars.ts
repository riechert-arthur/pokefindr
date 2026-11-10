import "server-only"
import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { eq, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { profiles, users } from "@/server/db/schema"
import type { ImageStore } from "@/server/ports/image-store"
import { AVATAR_MAX_BYTES, AVATAR_SIZE } from "@/lib/avatars"

/** Why an upload was refused. */
export type AvatarRefusal = "avatarTooLarge" | "avatarWrongType" | "avatarRejected"

export class AvatarError extends Error {
  constructor(readonly code: AvatarRefusal, message: string) {
    super(message)
  }
}

/**
 * The image type from the file's first bytes, never its name or Content-Type:
 * JPEG, PNG or WebP. Anything else (SVG, which can carry scripts, GIF, HEIC) is null.
 */
export function sniffImageType(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  const at = (offset: number, sig: number[]) => sig.every((b, i) => bytes[offset + i] === b)
  if (at(0, [0xff, 0xd8, 0xff])) return "jpeg"
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png"
  // "RIFF" <size> "WEBP"
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return "webp"
  return null
}

/**
 * Checks an upload and re-encodes it as a 256×256 WebP, cropped to the center.
 * Re-encoding drops all metadata (EXIF, GPS), after turning the picture upright
 * by its EXIF orientation, and anything else hidden in the file.
 */
export async function processAvatar(bytes: Uint8Array): Promise<Buffer> {
  if (bytes.byteLength > AVATAR_MAX_BYTES) throw new AvatarError("avatarTooLarge", "That file is over 2 MB. Choose a smaller photo.")
  const type = sniffImageType(bytes)
  if (!type) throw new AvatarError("avatarWrongType", "Choose a JPEG, PNG or WebP photo.")
  try {
    // limitInputPixels stops a small file that decodes to a huge image (a "decompression bomb").
    return await sharp(bytes, { limitInputPixels: 50_000_000, failOn: "error" })
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    throw new AvatarError("avatarRejected", "We couldn't read that photo. Try another one.")
  }
}

async function currentImage(userId: string, db: Database): Promise<{ found: boolean; image: string | null }> {
  const [row] = await db.select({ image: users.image }).from(users).where(eq(users.id, userId))
  return { found: Boolean(row), image: row?.image ?? null }
}

/** Deletes `url` from the store if it's one of ours; a failure is logged, not thrown (the row has already moved on). */
async function deleteStored(store: ImageStore | null, url: string | null) {
  if (!store || !url || !store.owns(url)) return
  await store.delete(url).catch((err) => console.error("[avatars] couldn't delete the old picture", url, err))
}

/**
 * Stores a new profile picture in users.image and deletes the one it replaces,
 * if we stored that one. Null when the user doesn't exist.
 */
export async function setAvatar(userId: string, bytes: Uint8Array, store: ImageStore, db: Database = getDb()): Promise<string | null> {
  const webp = await processAvatar(bytes)
  const before = await currentImage(userId, db)
  if (!before.found) return null
  const url = await store.put(`avatars/${userId}/${randomUUID()}.webp`, webp, "image/webp")
  await db.update(users).set({ image: url, updatedAt: new Date() }).where(eq(users.id, userId))
  await deleteStored(store, before.image)
  return url
}

/**
 * Removes a profile picture (back to initials), uploaded or from Google or
 * Discord, and deletes the stored file if it's ours. False when the user doesn't exist.
 */
export async function removeAvatar(userId: string, store: ImageStore | null, db: Database = getDb()): Promise<boolean> {
  const before = await currentImage(userId, db)
  if (!before.found) return false
  await db.update(users).set({ image: null, updatedAt: new Date() }).where(eq(users.id, userId))
  await deleteStored(store, before.image)
  return true
}

/** The user id for a username (any case), for moderators removing someone's picture. */
export async function userIdForUsername(username: string, db: Database = getDb()): Promise<string | null> {
  const [row] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(sql`lower(${profiles.username}) = lower(${username})`)
    .limit(1)
  return row?.id ?? null
}
