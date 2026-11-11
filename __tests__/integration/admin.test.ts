import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { locationSubmissions } from "@/server/db/schema"
import { GET as summary } from "@/app/api/admin/summary/route"
import { requireEntitlement, roleOf } from "@/server/admin/access"
import { insertProfiles } from "./testDatabase"

const MEMBER = randomUUID()
const MOD = randomUUID()
const ADMIN = randomUUID()

beforeEach(async () => {
  await insertProfiles(getDb(), [
    { id: MEMBER, username: "ash" },
    { id: MOD, username: "brock", role: "moderator" },
    { id: ADMIN, username: "misty", role: "admin" },
  ])
})

const req = (userId?: string) => new NextRequest("http://localhost/api/admin/summary", { headers: userId ? { "x-user-id": userId } : {} })

describe("admin access", () => {
  it("reads each user's role", async () => {
    expect(await roleOf(MEMBER)).toBe("member")
    expect(await roleOf(null)).toBeNull()
    expect(await roleOf(randomUUID())).toBeNull()
    expect(await roleOf(MOD)).toBe("moderator")
    expect(await roleOf(ADMIN)).toBe("admin")
  })

  it("answers 401 without a session and 404 to anyone who isn't allowed", async () => {
    expect((await requireEntitlement(req(), "moderation.view")) as Response).toHaveProperty("status", 401)
    expect((await requireEntitlement(req(MEMBER), "moderation.view")) as Response).toHaveProperty("status", 404)
    expect((await requireEntitlement(req(randomUUID()), "moderation.view")) as Response).toHaveProperty("status", 404)
    expect((await requireEntitlement(req(MOD), "admin.jobs")) as Response).toHaveProperty("status", 404)
    expect(await requireEntitlement(req(MOD), "moderation.view")).toEqual({ userId: MOD, role: "moderator" })
    expect(await requireEntitlement(req(ADMIN), "admin.jobs")).toEqual({ userId: ADMIN, role: "admin" })
  })
})

describe("GET /api/admin/summary", () => {
  it("counts the queue and its oldest submission, for staff only", async () => {
    expect((await summary(req(MEMBER))).status).toBe(404)
    expect(await (await summary(req(MOD))).json()).toMatchObject({ queue: { count: 0, oldestAt: null } })
    const old = new Date("2026-11-01T10:00:00Z")
    await getDb()
      .insert(locationSubmissions)
      .values([
        { kind: "shop", payload: { name: "A" }, geog: { lng: -104.99, lat: 39.74 }, submittedBy: MEMBER, createdAt: old },
        { kind: "shop", payload: { name: "B" }, geog: { lng: -104.98, lat: 39.74 }, submittedBy: MEMBER },
        { kind: "shop", payload: { name: "C" }, geog: { lng: -104.97, lat: 39.74 }, submittedBy: MEMBER, status: "rejected", rejectReason: "spam" },
      ])
    expect(await (await summary(req(ADMIN))).json()).toMatchObject({ queue: { count: 2, oldestAt: old.toISOString() } })
  })
})
