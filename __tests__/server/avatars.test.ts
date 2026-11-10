// @vitest-environment node
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { AvatarError, processAvatar, sniffImageType } from "@/server/services/avatars"
import { LocalImageStore } from "@/server/adapters/image-store/local"
import { VercelBlobImageStore } from "@/server/adapters/image-store/vercel-blob"

/** A width×height photo with EXIF (including GPS), as a phone would save it. */
async function photo(format: "jpeg" | "png" | "webp", width = 640, height = 480) {
  return sharp({ create: { width, height, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .withExif({ IFD0: { Make: "PokePhone", Model: "X" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "39/1 44/1 0/1" } })
    [format]()
    .toBuffer()
}

const refusal = (p: Promise<unknown>) => p.then(() => null, (e) => (e instanceof AvatarError ? e.code : e))

describe("sniffImageType", () => {
  it("reads the type from the bytes", async () => {
    expect(sniffImageType(await photo("jpeg"))).toBe("jpeg")
    expect(sniffImageType(await photo("png"))).toBe("png")
    expect(sniffImageType(await photo("webp"))).toBe("webp")
  })

  it("refuses SVG, GIF and anything else, whatever it's called", () => {
    expect(sniffImageType(new TextEncoder().encode(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`))).toBeNull()
    expect(sniffImageType(new TextEncoder().encode("GIF89a…"))).toBeNull()
    expect(sniffImageType(new Uint8Array())).toBeNull()
  })
})

describe("processAvatar", () => {
  it.each(["jpeg", "png", "webp"] as const)("turns a %s into a 256×256 WebP with no metadata", async (format) => {
    const input = await photo(format)
    expect((await sharp(input).metadata()).exif).toBeDefined()
    const out = await processAvatar(input)
    const meta = await sharp(out).metadata()
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 })
    expect(meta.exif).toBeUndefined()
    expect(meta.icc).toBeUndefined()
    expect(out.includes(Buffer.from("PokePhone"))).toBe(false)
  })

  it("crops a tall photo to its center", async () => {
    // Top third blue, the rest red: the center crop is red.
    const tall = await sharp({ create: { width: 300, height: 900, channels: 3, background: { r: 220, g: 0, b: 0 } } })
      .composite([{ input: { create: { width: 300, height: 300, channels: 3, background: { r: 0, g: 0, b: 220 } } }, top: 0, left: 0 }])
      .png()
      .toBuffer()
    const { data } = await sharp(await processAvatar(tall)).raw().toBuffer({ resolveWithObject: true })
    const [r, g, b] = data.subarray((128 * 256 + 128) * 3)
    expect(r).toBeGreaterThan(150)
    expect(b).toBeLessThan(80)
    expect(g).toBeLessThan(80)
  })

  it("refuses files over 2 MB, the wrong type, and broken images", async () => {
    expect(await refusal(processAvatar(new Uint8Array(2 * 1024 * 1024 + 1)))).toBe("avatarTooLarge")
    expect(await refusal(processAvatar(new TextEncoder().encode("<svg/>")))).toBe("avatarWrongType")
    expect(await refusal(processAvatar(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])))).toBe("avatarRejected")
  })
})

describe("LocalImageStore", () => {
  it("writes under its folder, serves from /uploads, and deletes only its own files", async () => {
    const root = await mkdtemp(path.join(process.env.TMPDIR ?? tmpdir(), "avatars-"))
    try {
      const store = new LocalImageStore(root)
      const url = await store.put("avatars/u1/a.webp", new Uint8Array([1, 2, 3]))
      expect(url).toBe("/uploads/avatars/u1/a.webp")
      expect([...(await readFile(path.join(root, "avatars/u1/a.webp")))]).toEqual([1, 2, 3])
      expect(store.owns("https://lh3.googleusercontent.com/a/x")).toBe(false)
      await store.delete(url)
      await expect(readFile(path.join(root, "avatars/u1/a.webp"))).rejects.toThrow()
      await expect(store.put("../escape.webp", new Uint8Array([1]))).rejects.toThrow(/outside the store/)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})

describe("VercelBlobImageStore", () => {
  it("owns public Blob URLs only", () => {
    const store = new VercelBlobImageStore("token")
    expect(store.owns("https://abc123.public.blob.vercel-storage.com/avatars/u1/a.webp")).toBe(true)
    expect(store.owns("https://cdn.discordapp.com/avatars/1/a.png")).toBe(false)
    expect(store.owns("/uploads/avatars/u1/a.webp")).toBe(false)
  })
})
