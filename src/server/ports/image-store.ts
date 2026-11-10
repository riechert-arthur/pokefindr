/**
 * Keeps uploaded images (profile pictures, #290) and serves them at a public
 * URL. Adapters live in `src/server/adapters/image-store/`; `getImageStore()`
 * (src/server/container.ts) picks one from config (IMAGE_STORE), so the
 * provider is a config change.
 */
export interface ImageStore {
  /** Stores `bytes` under `key` (e.g. "avatars/<user id>/<uuid>.webp") and returns its public URL. */
  put(key: string, bytes: Uint8Array, contentType: string): Promise<string>
  /** Deletes the image at `url`. Does nothing for a URL this store didn't make, or one already gone. */
  delete(url: string): Promise<void>
  /** Whether `url` is one of this store's (and not, say, a Google or Discord picture). */
  owns(url: string): boolean
}
