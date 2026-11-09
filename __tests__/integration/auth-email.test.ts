import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import type { MailMessage } from "@/server/ports/mailer"

// Every email the app sends, in order.
const { outbox, mail } = vi.hoisted(() => ({ outbox: [] as MailMessage[], mail: { down: false } }))
vi.mock("@/server/container", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/server/container")>()),
  getMailer: () => ({
    send: async (m: MailMessage) => {
      if (mail.down) throw new Error("smtp down")
      outbox.push(m)
    },
  }),
}))

import { POST as signup } from "@/app/api/auth/signup/route"
import { POST as login } from "@/app/api/auth/login/route"
import { getAuth, resetAuthForTests, settleBackgroundForTests } from "@/server/auth/auth"
import { getDb } from "@/server/db/client"
import { sessions, users } from "@/server/db/schema"
import { closeTestConnection } from "./testDatabase"

afterAll(closeTestConnection)
beforeEach(() => {
  outbox.length = 0
  mail.down = false
  resetAuthForTests()
})

const APP = "http://localhost:3000"
// Each waits for the emails the request sends in the background.
const settled = async (res: Promise<Response>) => {
  const done = await res
  await settleBackgroundForTests()
  return done
}
const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown) =>
  settled(handler(new NextRequest(`${APP}/api/auth/x`, { method: "POST", body: JSON.stringify(body) })))
const identity = (path: string, init?: RequestInit) =>
  settled(getAuth().handler(new Request(`${APP}/api/identity${path}`, { ...init, headers: { "content-type": "application/json", origin: APP, ...init?.headers } })))
const linkIn = (m: MailMessage) => m.text.match(/https?:\/\/\S+/)![0]
const open = (url: string) => settled(getAuth().handler(new Request(url)))

const form = { name: "Misty", username: "misty", email: "misty@example.com", password: "cerulean-gym-water!", passwordVerification: "cerulean-gym-water!" }

describe("confirming an email", () => {
  it("sends a link on sign-up that confirms the account and lands on /login?verified=1", async () => {
    await post(signup, form)
    expect(outbox).toHaveLength(1)
    expect(outbox[0]).toMatchObject({ to: "misty@example.com", subject: "Confirm your PokeFindr account" })
    const link = linkIn(outbox[0])
    expect(link.startsWith(`${APP}/api/identity/verify-email?token=`)).toBe(true)

    const res = await open(link)
    expect(res.status).toBe(302)
    expect(res.headers.get("location")).toBe("/login?verified=1")
    const [user] = await getDb().select().from(users)
    expect(user.emailVerified).toBe(true)
    expect((await post(login, { email: form.email, password: form.password })).status).toBe(200)
  })

  it("sends a new link when someone logs in before confirming, which also lands on /login?verified=1", async () => {
    await post(signup, form)
    await post(login, { email: form.email, password: form.password })
    expect(outbox.map((m) => m.subject)).toEqual(["Confirm your PokeFindr account", "Confirm your PokeFindr account"])
    expect((await open(linkIn(outbox[1]))).headers.get("location")).toBe("/login?verified=1")
  })

  it("sends a bad link back to /login with an error", async () => {
    const res = await open(`${APP}/api/identity/verify-email?token=nonsense&callbackURL=${encodeURIComponent("/login?verified=1")}`)
    expect(res.headers.get("location")).toMatch(/^\/login\?verified=1&error=/)
  })
})

describe("resetting a password", () => {
  const reset = async (email: string) => {
    const res = await identity("/request-password-reset", { method: "POST", body: JSON.stringify({ email, redirectTo: "/reset-password" }) })
    expect(res.status).toBe(200)
  }

  it("emails a link to /reset-password that sets a new password and ends other sessions", async () => {
    await post(signup, form)
    await open(linkIn(outbox[0]))
    await post(login, { email: form.email, password: form.password })
    expect(await getDb().select().from(sessions)).toHaveLength(1)

    await reset(form.email)
    const mail = outbox.at(-1)!
    expect(mail.subject).toBe("Reset your PokeFindr password")
    const landing = await open(linkIn(mail))
    const location = new URL(landing.headers.get("location")!, APP)
    expect(location.pathname).toBe("/reset-password")
    const token = location.searchParams.get("token")!

    const done = await identity("/reset-password", { method: "POST", body: JSON.stringify({ newPassword: "a-brand-new-password!", token }) })
    expect(done.status).toBe(200)
    expect(await getDb().select().from(sessions)).toHaveLength(0)
    expect((await post(login, { email: form.email, password: form.password })).status).toBe(401)
    expect((await post(login, { email: form.email, password: "a-brand-new-password!" })).status).toBe(200)
    // A token works once.
    const again = await identity("/reset-password", { method: "POST", body: JSON.stringify({ newPassword: "yet-another-password!", token }) })
    expect(again.status).toBe(400)
  })

  it("answers the same for an unknown email, and sends nothing", async () => {
    await reset("nobody@example.com")
    expect(outbox).toHaveLength(0)
  })

  it("confirms the email too, so a squatted sign-up can't lock the owner out", async () => {
    await post(signup, form)
    await reset(form.email)
    const token = new URL(new URL((await open(linkIn(outbox.at(-1)!))).headers.get("location")!, APP)).searchParams.get("token")!
    await identity("/reset-password", { method: "POST", body: JSON.stringify({ newPassword: "the-owners-password!", token }) })
    const [user] = await getDb().select().from(users).where(eq(users.email, form.email))
    expect(user.emailVerified).toBe(true)
    expect((await post(login, { email: form.email, password: "the-owners-password!" })).status).toBe(200)
  })
})

describe("a mailer that fails", () => {
  it("doesn't undo the sign-up", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {})
    mail.down = true
    const res = await post(signup, form)
    expect(res.status).toBe(200)
    expect(await getDb().select().from(users)).toHaveLength(1)
    expect(logged).toHaveBeenCalledWith(expect.stringContaining("Confirm your PokeFindr account"), expect.any(Error))
    logged.mockRestore()
  })
})
