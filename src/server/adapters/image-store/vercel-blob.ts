import "server-only"
import { del, put } from "@vercel/blob"
import type { ImageStore } from "@/server/ports/image-store"

/** Public Vercel Blob stores serve from `<store id>.public.blob.vercel-storage.com`. */
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/

/**
 * Images in Vercel Blob (production). Each upload gets a new key, so a
 * picture's URL never changes content and can be cached for a long time.
 */
export class VercelBlobImageStore implements ImageStore {
  constructor(private readonly token: string) {}

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const blob = await put(key, Buffer.from(bytes), {
      access: "public",
      contentType,
      token: this.token,
      // Keys are unique (a UUID per upload), so the file at a URL never changes.
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    })
    return blob.url
  }

  async delete(url: string): Promise<void> {
    if (this.owns(url)) await del(url, { token: this.token })
  }

  owns(url: string): boolean {
    try {
      return BLOB_HOST.test(new URL(url).hostname)
    } catch {
      return false
    }
  }
}
