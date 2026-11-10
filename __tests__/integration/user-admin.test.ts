import { beforeEach, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import { NextRequest } from "next/server"
import { getDb } from "@/server/db/client"
import { profiles, roleChanges, users } from "@/server/db/schema"
import { listUsers, setRole } from "@/server/services/user-admin"
import { GET as listRoute } from "@/app/api/admin/users/route"
import { PATCH as patchRoute } from "@/app/api/admin/users/[id]/route"
import { USERS_PER_PAGE, type UserPage } from "@/lib/admin/users"
import { insertProfiles } from "./testDatabase"

const SUPER = randomUUID()
const ADMIN = randomUUID()
const MOD = randomUUID()
const MISTY = randomUUID()
const ASH = randomUUID()

beforeEach(async () => {
  await insertProfiles(getDb(), [
    { id: SUPER, username: "oak", fullName: "Professor Oak", role: "super_admin" },
    { id: ADMIN, username: "dev", role: "admin" },
    { id: MOD, username: "moderator", role: "moderator" },
    { id: MISTY, username: "misty", fullName: "Misty Waterflower" },
    { id: ASH, username: "ash_k", fullName: "Ash Ketchum" },
  ])
  await getDb().update(users).set({ email: "misty@pokefindr.local" }).where(eq(users.id, MISTY))
  await getDb().update(users).set({ email: "ash@example.com" }).where(eq(users.id, ASH))
})

const roleOf = async (id: string) => (await getDb().select({ role: profiles.role }).from(profiles).where(eq(profiles.id, id)))[0]?.role
const get = (query: string, userId?: string) =>
  listRoute(new NextRequest(`http://localhost/api/admin/users${query}`, { headers: userId ? { "x-user-id": userId } : {} }))
const patch = (id: string, body: unknown, userId?: string) =>
  patchRoute(new NextRequest(`http://localhost/api/admin/users/${id}`, { method: "PATCH", headers: userId ? { "x-user-id": userId } : {}, body: JSON.stringify(body) }), {
    params: Promise.resolve({ id }),
  })

describe("listUsers", () => {
  const names = async (args: Parameters<typeof listUsers>[0]) => (await listUsers(args)).users.map((u) => u.username).sort()

  it("finds people by part of a username or name, or the start of an email", async () => {
    expect(await names({ q: "mist" })).toEqual(["misty"])
    expect(await names({ q: "ketchum" })).toEqual(["ash_k"])
    expect(await names({ q: "ash@" })).toEqual(["ash_k"])
    // Only the start of an email matches, so a domain doesn't list everyone on it.
    expect(await names({ q: "example.com" })).toEqual([])
    // A typed % or _ is literal.
    expect(await names({ q: "%" })).toEqual([])
    expect(await names({ q: "h_k" })).toEqual(["ash_k"])
  })

  it("filters by role and returns each person's email, name and role", async () => {
    const page = await listUsers({ role: "moderator" })
    expect(page.users).toEqual([{ id: MOD, username: "moderator", name: "moderator", email: `${MOD}@example.test`, role: "moderator", joinedAt: expect.any(String) }])
    expect(page.nextCursor).toBeNull()
    expect(await names({ role: "member" })).toEqual(["ash_k", "misty"])
  })

  it("pages through everyone, 50 at a time, newest first", async () => {
    const start = Date.parse("2026-01-01T00:00:00Z")
    const extra = Array.from({ length: USERS_PER_PAGE + 5 }, (_, i) => ({ id: randomUUID(), username: `trainer${i}` }))
    await insertProfiles(getDb(), extra)
    for (const [i, u] of extra.entries()) await getDb().update(users).set({ createdAt: new Date(start + i * 1000) }).where(eq(users.id, u.id))
    const first = await listUsers({ q: "trainer" })
    expect(first.users).toHaveLength(USERS_PER_PAGE)
    expect(first.users[0].username).toBe(`trainer${extra.length - 1}`)
    const second = await listUsers({ q: "trainer", cursor: first.nextCursor })
    expect(second.users.map((u) => u.username)).toEqual(["trainer4", "trainer3", "trainer2", "trainer1", "trainer0"])
    expect(second.nextCursor).toBeNull()
    // A cursor that isn't ours starts from the top.
    expect((await listUsers({ q: "trainer", cursor: "nonsense" })).users).toHaveLength(USERS_PER_PAGE)
  })

  it("doesn't skip someone who joined within the same millisecond as a page's last row", async () => {
    const extra = Array.from({ length: USERS_PER_PAGE + 1 }, (_, i) => ({ id: randomUUID(), username: `trainer${i}` }))
    await insertProfiles(getDb(), extra)
    // Microseconds apart, newest first: trainer0 is .123456, the next .123455, and so on.
    for (const [i, u] of extra.entries()) await getDb().execute(sql`update users set created_at = '2026-01-01T00:00:00.123456Z'::timestamptz - make_interval(secs => ${i} * 0.000001) where id = ${u.id}`)
    const first = await listUsers({ q: "trainer" })
    const second = await listUsers({ q: "trainer", cursor: first.nextCursor })
    expect([...first.users, ...second.users].map((u) => u.username)).toEqual(extra.map((u) => u.username))
  })
})

describe("setRole", () => {
  it("changes a role and records who changed it, from what and to what", async () => {
    expect(await setRole(SUPER, MISTY, "moderator")).toEqual({ status: "done", from: "member", to: "moderator" })
    expect(await roleOf(MISTY)).toBe("moderator")
    const log = await getDb().select().from(roleChanges)
    expect(log).toEqual([{ id: expect.any(String), userId: MISTY, changedBy: SUPER, fromRole: "member", toRole: "moderator", createdAt: expect.any(Date) }])
    expect(await setRole(SUPER, MISTY, "moderator")).toEqual({ status: "unchanged" })
    expect(await getDb().select().from(roleChanges)).toHaveLength(1)
  })

  it("refuses your own role, unknown roles and granting super admin", async () => {
    expect(await setRole(SUPER, SUPER, "member")).toEqual({ status: "own" })
    expect(await setRole(SUPER, MISTY, "owner")).toEqual({ status: "invalid_role" })
    expect(await setRole(SUPER, MISTY, "super_admin")).toEqual({ status: "invalid_role" })
    expect(await setRole(SUPER, randomUUID(), "member")).toEqual({ status: "not_found" })
    expect(await roleOf(MISTY)).toBe("member")
    expect(await getDb().select().from(roleChanges)).toEqual([])
  })

  it("refuses anyone who can't manage users", async () => {
    expect(await setRole(ADMIN, MISTY, "admin")).toEqual({ status: "forbidden" })
    expect(await roleOf(MISTY)).toBe("member")
  })

  // Your own role is refused, and only a super admin can act, so the last one can only go if two
  // super admins demote each other at once. The row locks run those one after the other.
  it("never removes the last super admin, even when two of them demote each other at once", async () => {
    const OTHER = randomUUID()
    await insertProfiles(getDb(), { id: OTHER, username: "elm", role: "super_admin" })
    const results = await Promise.all([setRole(OTHER, SUPER, "admin"), setRole(SUPER, OTHER, "admin")])
    // The second to run finds its actor is no longer a super admin.
    expect(results.map((r) => r.status).sort()).toEqual(["done", "forbidden"])
    const left = await getDb().select({ id: profiles.id }).from(profiles).where(eq(profiles.role, "super_admin"))
    expect(left).toHaveLength(1)
  })
})

describe("the users routes", () => {
  const roles: [string, string][] = [
    ["a member", ASH],
    ["a moderator", MOD],
    ["an admin", ADMIN],
  ]

  it("answer 401 without a session", async () => {
    expect((await get("")).status).toBe(401)
    expect((await patch(MISTY, { role: "moderator" })).status).toBe(401)
  })

  it.each(roles)("answer 404 to %s", async (_, id) => {
    expect((await get("", id)).status).toBe(404)
    expect((await patch(MISTY, { role: "moderator" }, id)).status).toBe(404)
    expect(await roleOf(MISTY)).toBe("member")
  })

  it("list and search users for a super admin", async () => {
    const res = await get("?q=misty", SUPER)
    expect(res.status).toBe(200)
    const page = (await res.json()) as UserPage
    expect(page.users.map((u) => [u.username, u.email, u.role])).toEqual([["misty", "misty@pokefindr.local", "member"]])
    expect((await get("?role=owner", SUPER)).status).toBe(400)
  })

  it("change a role for a super admin, and explain a refusal", async () => {
    const res = await patch(MISTY, { role: "moderator" }, SUPER)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: "done", from: "member", to: "moderator" })
    expect(await roleOf(MISTY)).toBe("moderator")

    const own = await patch(SUPER, { role: "member" }, SUPER)
    expect(own.status).toBe(409)
    expect(await own.json()).toMatchObject({ status: "own", error: "You can't change your own role." })
    expect((await patch(MISTY, { role: "super_admin" }, SUPER)).status).toBe(400)
    expect((await patch(MISTY, {}, SUPER)).status).toBe(400)
    expect((await patch("not-a-uuid", { role: "member" }, SUPER)).status).toBe(404)
  })
})
