import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { revalidateTag } from "next/cache"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { adPlacements } from "@/server/db/schema"
import { GET as publicFlags } from "@/app/api/ads/placements/route"
import { GET as adminList } from "@/app/api/admin/ads/route"
import { POST as adminSet } from "@/app/api/admin/ads/[placement]/route"
import { insertProfiles } from "./testDatabase"

const ADMIN = randomUUID()
const MOD = randomUUID()

beforeEach(async () => {
  await insertProfiles(getDb(), [
    { id: ADMIN, username: "misty", role: "admin" },
    { id: MOD, username: "brock", role: "moderator" },
  ])
})

const set = (placement: string, enabled: unknown, userId = ADMIN) =>
  adminSet(new NextRequest(`http://localhost/api/admin/ads/${placement}`, { method: "POST", headers: { "x-user-id": userId }, body: JSON.stringify({ enabled }) }), { params: Promise.resolve({ placement }) })
const flags = async () => ((await (await publicFlags()).json()) as { placements: Record<string, boolean> }).placements

describe("ad placements", () => {
  it("are all on until an admin switches one off, for everyone, and not cached by browsers", async () => {
    expect(await flags()).toEqual({ results: true, details: true, landing: true })
    expect((await publicFlags()).headers.get("cache-control")).toBe("no-store")
    expect((await set("details", false)).status).toBe(200)
    expect(revalidateTag).toHaveBeenCalledWith("ad-placements")
    expect(await flags()).toEqual({ results: true, details: false, landing: true })
    const [row] = await getDb().select().from(adPlacements)
    expect(row).toMatchObject({ placement: "details", enabled: false, updatedBy: ADMIN })
    await set("details", true)
    expect((await flags()).details).toBe(true)
  })

  it("lists the switches and the sponsors for admins only", async () => {
    const res = await adminList(new NextRequest("http://localhost/api/admin/ads", { headers: { "x-user-id": ADMIN } }))
    expect(await res.json()).toMatchObject({ placements: { results: true, details: true, landing: true }, sponsors: expect.any(Array) })
    expect((await adminList(new NextRequest("http://localhost/api/admin/ads", { headers: { "x-user-id": MOD } }))).status).toBe(404)
    expect((await set("results", false, MOD)).status).toBe(404)
  })

  it("refuses an unknown placement or a bad body", async () => {
    expect((await set("sidebar", false)).status).toBe(404)
    expect((await set("results", "no")).status).toBe(400)
  })
})
