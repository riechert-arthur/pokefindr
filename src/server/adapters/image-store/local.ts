import "server-only"
import { mkdir, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import type { ImageStore } from "@/server/ports/image-store"

/** The URL path the files are served under: `public/uploads/…` in the app. */
const URL_PREFIX = "/uploads/"

/**
 * Images on local disk, under `public/uploads/` (gitignored), which `next dev`
 * serves as static files: local dev with no storage account. Not for
 * production: `next start` only serves the files that existed at build time,
 * and serverless instances don't share a disk.
 */
export class LocalImageStore implements ImageStore {
  constructor(private readonly root = path.join(process.cwd(), "public", "uploads")) {}

  async put(key: string, bytes: Uint8Array): Promise<string> {
    const file = this.fileFor(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, bytes)
    return URL_PREFIX + key
  }

  async delete(url: string): Promise<void> {
    if (this.owns(url)) await rm(this.fileFor(url.slice(URL_PREFIX.length)), { force: true })
  }

  owns(url: string): boolean {
    return url.startsWith(URL_PREFIX)
  }

  /** The file for `key`, refusing one that would land outside the root ("../"). */
  private fileFor(key: string): string {
    const file = path.resolve(this.root, key)
    if (!file.startsWith(this.root + path.sep)) throw new Error(`image key outside the store: ${key}`)
    return file
  }
}
