import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import type { MailMessage } from "@/server/ports/mailer"

const outbox: MailMessage[] = vi.hoisted(() => [])
vi.mock("@/server/container", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/container")>()),
  getMailer: () => ({ send: async (m: MailMessage) => void outbox.push(m) }),
}))

import { GET, PATCH } from "@/app/api/user-settings/route"
import { POST as login } from "@/app/api/auth/login/route"
import { getAuth, resetAuthForTests } from "@/server/auth/auth"
import { getDb } from "@/server/db/client"
import { profiles, users } from "@/server/db/schema"
import { closeTestConnection, insertProfiles } from "./testDatabase"

afterAll(closeTestConnection)
beforeEach(() => {
  outbox.length = 0
  resetAuthForTests()
})

const APP = "http://localhost:3000"
const PASSWORD = "a-long-password-1234!"

/** A confirmed user with a profile, logged in: their id and cookies. */
async function signedInUser(email = "ash@example.com", username = "ash") {
  const { user } = await getAuth().api.signUpEmail({ body: { email, password: PASSWORD, name: "Ash" } })
  await getDb().update(users).set({ emailVerified: true }).where(eq(users.id, user.id))
  await getDb().insert(profiles).values({ id: user.id, username, fullName: "Ash", onboarded: true })
  const res = await login(new NextRequest(`${APP}/api/auth/login`, { method: "POST", body: JSON.stringify({ email, password: PASSWORD }) }))
  outbox.length = 0
  return { id: user.id, cookie: res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") }
}

const settings = (userId: string, cookie = "") => new NextRequest(`${APP}/api/user-settings`, { headers: { "x-user-id": userId, cookie } })
const patch = (userId: string, body: unknown, cookie = "") =>
  PATCH(new NextRequest(`${APP}/api/user-settings`, { method: "PATCH", body: JSON.stringify(body), headers: { "x-user-id": userId, cookie } }))
const emailOf = async (id: string) => (await getDb().select({ email: users.email }).from(users).where(eq(users.id, id)))[0].email
const linkIn = (m: MailMessage) => m.text.match(/https?:\/\/\S+/)![0]

describe("user settings", () => {
  it("reads the name, username and email from our database", async () => {
    const { id } = await signedInUser()
    expect(await (await GET(settings(id))).json()).toEqual({ fullName: "Ash", username: "ash", email: "ash@example.com" })
  })

  it("changes the name and username, but not to a taken username", async () => {
    const { id } = await signedInUser()
    await insertProfiles(getDb(), { id: crypto.randomUUID(), username: "Misty" })
    expect((await patch(id, { fullName: "Ash Ketchum", username: "ashk" })).status).toBe(200)
    expect(await (await GET(settings(id))).json()).toMatchObject({ fullName: "Ash Ketchum", username: "ashk" })
    expect((await patch(id, { username: "misty" })).status).toBe(409)
    expect((await patch(id, { username: "has space" })).status).toBe(400)
    expect((await patch(id, { isVerified: true })).status).toBe(400)
  })
})

describe("changing the email", () => {
  it("changes nothing until the old address approves and the new one confirms", async () => {
    const { id, cookie } = await signedInUser()
    const res = await patch(id, { email: "ash@new.example" }, cookie)
    expect(await res.json()).toEqual({ ok: true, emailPending: true })
    expect(await emailOf(id)).toBe("ash@example.com")

    // 1. The current address approves.
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ to: "ash@example.com", subject: "Approve your PokeFindr email change" })
    const approved = await getAuth().handler(new Request(linkIn(outbox[0])))
    expect(approved.headers.get("location")).toBe("/settings?email=link")
    expect(await emailOf(id)).toBe("ash@example.com")

    // 2. The new address confirms.
    expect(outbox[1]).toMatchObject({ to: "ash@new.example", subject: "Confirm your new PokeFindr email" })
    await getAuth().handler(new Request(linkIn(outbox[1])))
    expect(await emailOf(id)).toBe("ash@new.example")
  })

  it("needs a fresh login (a Better Auth session), not just the app cookie", async () => {
    const { id } = await signedInUser()
    const res = await patch(id, { email: "ash@new.example" })
    expect(res.status).toBe(401)
    expect(await res.json()).toMatchObject({ code: "REAUTH" })
  })

  it("answers the same for an email that's taken, and sends nothing", async () => {
    await signedInUser("misty@example.com", "misty")
    const { id, cookie } = await signedInUser()
    expect(await (await patch(id, { email: "misty@example.com" }, cookie)).json()).toEqual({ ok: true, emailPending: true })
    expect(outbox).toHaveLength(0)
    expect(await emailOf(id)).toBe("ash@example.com")
  })
})
