import "server-only"
import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { eq } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { locationRatings, users } from "@/server/db/schema"
import { deleteOwnedImage, type ImageStore } from "@/server/ports/image-store"
import { AVATAR_MAX_BYTES, AVATAR_SIZE } from "@/lib/avatars"

/** Why an upload was refused. */
export type AvatarRefusal = "avatarTooLarge" | "avatarWrongType" | "avatarRejected"

export class AvatarError extends Error {
  constructor(readonly code: AvatarRefusal, message: string) {
    super(message)
  }
}

export const tooLarge = () => new AvatarError("avatarTooLarge", "That file is over 2 MB. Choose a smaller photo.")

type ImageType = "jpeg" | "png" | "webp"

/**
 * The most pixels a file may decode to (a "decompression bomb" guard). JPEG and
 * WebP decode straight to a smaller size (shrink-on-load), so a 50 MP phone photo
 * stays cheap; PNG can't, and 4096² is already about 67 MB as RGBA.
 */
const MAX_PIXELS: Record<ImageType, number> = { jpeg: 50_000_000, webp: 50_000_000, png: 4096 * 4096 }

/**
 * The image type from the file's first bytes, never its name or Content-Type:
 * JPEG, PNG or WebP. Anything else (SVG, which can carry scripts, GIF, HEIC) is null.
 */
export function sniffImageType(bytes: Uint8Array): ImageType | null {
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
  if (bytes.byteLength > AVATAR_MAX_BYTES) throw tooLarge()
  const type = sniffImageType(bytes)
  if (!type) throw new AvatarError("avatarWrongType", "Choose a JPEG, PNG or WebP photo.")
  const rejected = new AvatarError("avatarRejected", "We couldn't read that photo. Try another one.")
  try {
    const image = sharp(bytes, { limitInputPixels: MAX_PIXELS[type], failOn: "error" })
    // libvips picks its decoder from the content, not from our sniff: make sure the
    // one it picked is the format the first bytes claimed, so a polyglot doesn't
    // reach another loader (SVG, PDF…) through a JPEG or WebP header.
    if ((await image.metadata()).format !== type) throw rejected
    return await image
      .rotate()
      .resize(AVATAR_SIZE, AVATAR_SIZE, { fit: "cover", position: "centre" })
      .webp({ quality: 82 })
      .toBuffer()
  } catch {
    throw rejected
  }
}

/**
 * Sets users.image to `image` with the row locked, so two uploads (or an upload
 * and a removal) can't both read the same old picture: each deletes the one it
 * actually replaced. Not found when the user doesn't exist.
 */
async function swapImage(userId: string, image: string | null, db: Database): Promise<{ found: false } | { found: true; old: string | null }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select({ image: users.image }).from(users).where(eq(users.id, userId)).for("update")
    if (!row) return { found: false as const }
    await tx.update(users).set({ image, updatedAt: new Date() }).where(eq(users.id, userId))
    return { found: true as const, old: row.image }
  })
}

/**
 * Stores a new profile picture in users.image and deletes the one it replaces,
 * if we stored that one. Null when the user doesn't exist.
 */
export async function setAvatar(userId: string, bytes: Uint8Array, store: ImageStore, db: Database = getDb()): Promise<string | null> {
  const webp = await processAvatar(bytes)
  // A random key only: the URL shows next to public reviews, so it mustn't carry the user id.
  const url = await store.put(`avatars/${randomUUID()}.webp`, webp, "image/webp")
  let swapped: Awaited<ReturnType<typeof swapImage>>
  try {
    swapped = await swapImage(userId, url, db)
  } catch (err) {
    await deleteOwnedImage(store, url)
    throw err
  }
  if (!swapped.found) {
    // The account went away while the file uploaded.
    await deleteOwnedImage(store, url)
    return null
  }
  await deleteOwnedImage(store, swapped.old)
  return url
}

/**
 * Removes a profile picture (back to initials), uploaded or from Google or
 * Discord, and deletes the stored file if it's ours. False when the user doesn't exist.
 */
export async function removeAvatar(userId: string, store: ImageStore | null, db: Database = getDb()): Promise<boolean> {
  const swapped = await swapImage(userId, null, db)
  if (!swapped.found) return false
  await deleteOwnedImage(store, swapped.old)
  return true
}

/**
 * Who wrote a review, for moderators removing the picture shown next to it. By
 * review, not by username, so a rename between loading the panel and clicking
 * can't point at someone else.
 */
export async function reviewerOf(reviewId: string, db: Database = getDb()): Promise<string | null> {
  const [row] = await db.select({ userId: locationRatings.userId }).from(locationRatings).where(eq(locationRatings.id, reviewId))
  return row?.userId ?? null
}
