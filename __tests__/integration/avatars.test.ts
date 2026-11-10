import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import sharp from "sharp"
import { MemoryImageStore } from "@/server/adapters/image-store/memory"

// One in-memory store, shared by the routes and the test.
const store = vi.hoisted(() => ({ current: null as MemoryImageStore | null }))
vi.mock("@/server/container", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/container")>()),
  getImageStore: () => store.current,
}))

import { DELETE, POST } from "@/app/api/user-settings/avatar/route"
import { DELETE as moderatorDelete } from "@/app/api/admin/avatars/[username]/route"
import { GET as sessionUser } from "@/app/api/auth/user/route"
import { getDb } from "@/server/db/client"
import { locationRatings, locations, profiles, users } from "@/server/db/schema"
import { getPanelReviews } from "@/server/services/reviews"
import { deleteUser } from "@/server/services/users"
import { closeTestConnection, insertProfiles } from "./testDatabase"

afterAll(closeTestConnection)
beforeEach(() => {
  store.current = new MemoryImageStore()
})

const APP = "http://localhost:3000"
const URL_ = `${APP}/api/user-settings/avatar`

async function photo(format: "jpeg" | "png" | "webp" = "jpeg") {
  return sharp({ create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 200 } } })
    .withExif({ IFD0: { Make: "PokePhone" } })
    [format]()
    .toBuffer()
}

async function user(username = "ash", role: "member" | "moderator" | "admin" = "member") {
  const id = crypto.randomUUID()
  await insertProfiles(getDb(), { id, username })
  if (role !== "member") await getDb().update(profiles).set({ role }).where(eq(profiles.id, id))
  return id
}

function upload(userId: string | null, bytes: Uint8Array | string, { type = "image/jpeg", headers = {} as Record<string, string> } = {}) {
  const form = new FormData()
  form.append("file", new Blob([bytes], { type }), "photo")
  return POST(new NextRequest(URL_, { method: "POST", body: form, headers: { ...(userId ? { "x-user-id": userId } : {}), ...headers } }))
}
const remove = (userId: string) => DELETE(new NextRequest(URL_, { method: "DELETE", headers: { "x-user-id": userId } }))
const imageOf = async (id: string) => (await getDb().select({ image: users.image }).from(users).where(eq(users.id, id)))[0]?.image ?? null

describe("POST /api/user-settings/avatar", () => {
  it("needs a signed-in user", async () => {
    const res = await upload(null, await photo())
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: "loginRequired" })
  })

  it("refuses a cross-site request", async () => {
    const id = await user()
    const res = await upload(id, await photo(), { headers: { "sec-fetch-site": "cross-site" } })
    expect(res.status).toBe(403)
    expect(await imageOf(id)).toBeNull()
  })

  it("stores a 256×256 WebP without EXIF in users.image, and the session shows it", async () => {
    const id = await user()
    const res = await upload(id, await photo("png"), { type: "image/png" })
    expect(res.status).toBe(200)
    const { image } = (await res.json()) as { image: string }
    expect(await imageOf(id)).toBe(image)
    const file = store.current!.get(image)!
    expect(file.contentType).toBe("image/webp")
    const meta = await sharp(file.bytes).metadata()
    expect(meta).toMatchObject({ format: "webp", width: 256, height: 256 })
    expect(meta.exif).toBeUndefined()
    const session = await sessionUser(new NextRequest(`${APP}/api/auth/user`, { headers: { "x-user-id": id } }))
    expect(await session.json()).toMatchObject({ user: { image } })
  })

  it("refuses a file over 2 MB", async () => {
    const id = await user()
    const res = await upload(id, new Uint8Array(2 * 1024 * 1024 + 10).fill(0xff))
    expect(res.status).toBe(413)
    expect(await res.json()).toMatchObject({ code: "avatarTooLarge" })
  })

  it("judges the type by the bytes: SVG and GIF are refused whatever they claim to be", async () => {
    const id = await user()
    const svg = await upload(id, `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`, { type: "image/jpeg" })
    expect(svg.status).toBe(415)
    expect(await svg.json()).toMatchObject({ code: "avatarWrongType" })
    const gif = await upload(id, "GIF89a\x01\x00\x01\x00", { type: "image/png" })
    expect(gif.status).toBe(415)
    // A real JPEG with the wrong Content-Type is fine.
    expect((await upload(id, await photo(), { type: "text/plain" })).status).toBe(200)
  })

  it("refuses a file that only starts like an image", async () => {
    const id = await user()
    const res = await upload(id, new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0]))
    expect(res.status).toBe(422)
    expect(await res.json()).toMatchObject({ code: "avatarRejected" })
  })

  it("replaces the picture and deletes the old file", async () => {
    const id = await user()
    const first = ((await (await upload(id, await photo())).json()) as { image: string }).image
    const second = ((await (await upload(id, await photo("webp"))).json()) as { image: string }).image
    expect(second).not.toBe(first)
    expect(await imageOf(id)).toBe(second)
    expect(store.current!.get(first)).toBeUndefined()
    expect(store.current!.files.size).toBe(1)
  })

  it("answers 503 when uploads are off (IMAGE_STORE=none)", async () => {
    store.current = null
    const id = await user()
    const res = await upload(id, await photo())
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ code: "avatarsUnavailable" })
  })

  it("is rate limited per account", async () => {
    const id = await user()
    const statuses: number[] = []
    for (let i = 0; i < 8; i++) statuses.push((await remove(id)).status)
    expect(statuses).toContain(429)
  })
})

describe("DELETE /api/user-settings/avatar", () => {
  it("goes back to initials and deletes the file", async () => {
    const id = await user()
    const image = ((await (await upload(id, await photo())).json()) as { image: string }).image
    expect((await remove(id)).status).toBe(200)
    expect(await imageOf(id)).toBeNull()
    expect(store.current!.get(image)).toBeUndefined()
  })

  it("clears a Google or Discord picture without touching the store", async () => {
    const id = await user()
    await getDb().update(users).set({ image: "https://lh3.googleusercontent.com/a/ash" }).where(eq(users.id, id))
    expect((await remove(id)).status).toBe(200)
    expect(await imageOf(id)).toBeNull()
  })
})

describe("DELETE /api/admin/avatars/:username", () => {
  const take = (staffId: string, username: string) =>
    moderatorDelete(new NextRequest(`${APP}/api/admin/avatars/${username}`, { method: "DELETE", headers: { "x-user-id": staffId } }), {
      params: Promise.resolve({ username }),
    })

  it("lets a moderator remove someone's picture, and no one else", async () => {
    const misty = await user("Misty")
    const image = ((await (await upload(misty, await photo())).json()) as { image: string }).image
    const member = await user("brock")
    expect((await take(member, "misty")).status).toBe(404)
    expect(await imageOf(misty)).toBe(image)

    const moderator = await user("jenny", "moderator")
    expect((await take(moderator, "misty")).status).toBe(200)
    expect(await imageOf(misty)).toBeNull()
    expect(store.current!.get(image)).toBeUndefined()
    expect((await take(moderator, "nobody")).status).toBe(404)
  })
})

describe("profile pictures elsewhere", () => {
  it("show next to the reviewer's reviews", async () => {
    const id = await user()
    const image = ((await (await upload(id, await photo())).json()) as { image: string }).image
    const [location] = await getDb()
      .insert(locations)
      .values({ machineId: "Q1", retailer: "Frys", geog: { lng: -111.544047, lat: 33.413887 } })
      .returning({ id: locations.id })
    await getDb().insert(locationRatings).values({ locationId: location.id, userId: id, rating: 5, text: "Stocked" })
    const { reviews } = await getPanelReviews(location.id, null)
    expect(reviews[0]).toMatchObject({ username: "ash", image })
  })

  it("are deleted with the account", async () => {
    const id = await user()
    const image = ((await (await upload(id, await photo())).json()) as { image: string }).image
    await deleteUser(id, getDb(), store.current)
    expect(store.current!.get(image)).toBeUndefined()
  })
})
