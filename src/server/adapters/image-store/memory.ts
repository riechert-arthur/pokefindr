import "server-only"
import type { ImageStore } from "@/server/ports/image-store"

const PREFIX = "memory://images/"

/** Images in this instance's memory, for tests. The URLs don't load in a browser. */
export class MemoryImageStore implements ImageStore {
  readonly files = new Map<string, { bytes: Uint8Array; contentType: string }>()

  async put(key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    this.files.set(key, { bytes, contentType })
    return PREFIX + key
  }

  async delete(url: string): Promise<void> {
    if (this.owns(url)) this.files.delete(url.slice(PREFIX.length))
  }

  owns(url: string): boolean {
    return url.startsWith(PREFIX)
  }

  /** Test helper: the stored file behind `url`. */
  get(url: string) {
    return this.owns(url) ? this.files.get(url.slice(PREFIX.length)) : undefined
  }
}
