import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import postgres from "postgres"
import { POST as signup } from "@/app/api/auth/signup/route"
import { POST as login } from "@/app/api/auth/login/route"
import { POST as logout } from "@/app/api/auth/logout/route"
import { GET as currentUser } from "@/app/api/auth/user/route"
import { resetAuthForTests } from "@/server/auth/auth"
import { resetServerConfigForTests } from "@/server/config"
import { getDb } from "@/server/db/client"
import { profiles, sessions, subscriptions, users } from "@/server/db/schema"
import { DEV_USER, isLocalDatabase, seedDevUser } from "../../scripts/db/seedDevUser"
import { closeTestConnection, testDatabaseUrl } from "./testDatabase"

const sql = postgres(testDatabaseUrl(), { max: 1, onnotice: () => {} })
afterAll(async () => {
  await sql.end({ timeout: 5 })
  await closeTestConnection()
})
beforeEach(() => resetAuthForTests())

const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown, headers: Record<string, string> = {}) =>
  handler(new NextRequest("http://localhost:3000/api/auth/x", { method: "POST", body: JSON.stringify(body), headers }))

const form = { name: "Ash Ketchum", username: "ash", email: "ash@example.com", password: "pallet-town-forever!", passwordVerification: "pallet-town-forever!" }
const cookieHeader = (res: Response) => res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
const confirm = (email: string) => getDb().update(users).set({ emailVerified: true }).where(eq(users.email, email))

describe("sign-up", () => {
  it("creates the user and the profile, onboarded", async () => {
    const res = await post(signup, form)
    expect(res.status).toBe(200)
    const [user] = await getDb().select().from(users)
    expect(user).toMatchObject({ email: "ash@example.com", name: "Ash Ketchum", emailVerified: false })
    expect(await getDb().select().from(profiles)).toMatchObject([{ id: user.id, username: "ash", fullName: "Ash Ketchum", onboarded: true }])
  })

  it("rejects bad input, and a taken username in any case", async () => {
    expect((await post(signup, { ...form, password: "short" })).status).toBe(400)
    await post(signup, form)
    const res = await post(signup, { ...form, email: "other@example.com", username: "ASH" })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: "That username is already taken" })
    expect(await getDb().select().from(users)).toHaveLength(1)
  })

  it("answers a taken email the same as a new one, and adds nothing", async () => {
    await post(signup, form)
    const res = await post(signup, { ...form, username: "ash2" })
    expect(res.status).toBe(200)
    expect(await getDb().select().from(profiles)).toHaveLength(1)
  })

  it("holds the username for a taken email too, so it can't show which emails have accounts", async () => {
    await post(signup, form)
    // Probe: the taken email with a fresh username, then the same username elsewhere.
    expect((await post(signup, { ...form, username: "probe_1" })).status).toBe(200)
    expect((await post(signup, { ...form, email: "other@example.com", username: "Probe_1" })).status).toBe(409)
    // The same answer as for a new email.
    expect((await post(signup, { ...form, email: "new@example.com", username: "probe_2" })).status).toBe(200)
    expect((await post(signup, { ...form, email: "other@example.com", username: "probe_2" })).status).toBe(409)
  })

  it("answers two sign-ups at once with one username the same, new email or taken", async () => {
    await post(signup, form)
    for (const [i, probed] of [form.email, "new@example.com"].entries()) {
      const username = `race_${i}`
      const results = await Promise.all([
        post(signup, { ...form, email: probed, username }),
        post(signup, { ...form, email: `fresh-${username}@example.com`, username }),
      ])
      expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    }
  })

  it("a day later, frees the name either way: the hold lapses, and the unconfirmed account's claim with it", async () => {
    await post(signup, form)
    await post(signup, { ...form, username: "probe_1" }) // taken email: only a hold
    await post(signup, { ...form, email: "new@example.com", username: "probe_2" }) // new email: an unconfirmed account
    await sql`update username_holds set expires_at = now() - interval '1 minute'`
    expect((await post(signup, { ...form, email: "a@example.com", username: "probe_1" })).status).toBe(200)
    expect((await post(signup, { ...form, email: "b@example.com", username: "probe_2" })).status).toBe(200)
    // The expired account made way for the new one.
    expect(await getDb().select().from(users).where(eq(users.email, "new@example.com"))).toEqual([])
    // A confirmed account keeps its name for good.
    await confirm("b@example.com")
    await sql`update username_holds set expires_at = now() - interval '1 minute'`
    expect((await post(signup, { ...form, email: "c@example.com", username: "probe_2" })).status).toBe(409)
  })

  it("clears a lapsed unconfirmed account on any sign-up for its name, new email or taken", async () => {
    await post(signup, form)
    await post(signup, { ...form, email: "stale@example.com", username: "stale_1" })
    await sql`update username_holds set expires_at = now() - interval '1 minute'`
    // A taken email with that name: the lapsed account goes, the same as for a new email.
    expect((await post(signup, { ...form, username: "stale_1" })).status).toBe(200)
    expect(await getDb().select().from(users).where(eq(users.email, "stale@example.com"))).toEqual([])
  })

  it("takes only ASCII usernames, so JavaScript and Postgres lowercase them the same", async () => {
    // JavaScript lowercases "ΜΑΣ" to "μας", Postgres to "μασ": names like it could miss a live hold.
    expect((await post(signup, { ...form, email: "greek@example.com", username: "ΜΑΣ" })).status).toBe(400)
  })

  it("keeps names from before our own accounts (profiles with no user row)", async () => {
    await sql`alter table profiles drop constraint profiles_id_users_id_fk`
    try {
      await sql`insert into profiles (id, username, onboarded) values (gen_random_uuid(), 'old_timer', true)`
      expect((await post(signup, { ...form, username: "Old_Timer" })).status).toBe(409)
      expect((await post(signup, { ...form, email: "new@example.com", username: "old_timer" })).status).toBe(409)
    } finally {
      await sql`delete from profiles where username = 'old_timer'`
      await sql`alter table profiles add constraint profiles_id_users_id_fk foreign key (id) references users (id) on delete cascade not valid`
    }
  })

  it("lets go of the hold when the sign-up fails", async () => {
    // Past Better Auth's 128-character limit: our form check passes, Better Auth refuses.
    const tooLong = "a-very-long-password!".repeat(7)
    expect((await post(signup, { ...form, username: "long_pw", password: tooLong, passwordVerification: tooLong })).status).toBe(400)
    expect((await post(signup, { ...form, email: "other@example.com", username: "long_pw" })).status).toBe(200)
  })

  it("refuses a username of only spaces", async () => {
    expect((await post(signup, { ...form, username: "   " })).status).toBe(400)
  })
})

describe("login", () => {
  it("refuses an unconfirmed email, then signs in once it's confirmed", async () => {
    await post(signup, form)
    const unconfirmed = await post(login, { email: form.email, password: form.password })
    expect(unconfirmed.status).toBe(401)
    // The same as a wrong password, so login can't show whether a sign-up made the account.
    const wrong = await post(login, { email: form.email, password: "not-the-password!!" })
    expect(await unconfirmed.json()).toEqual(await wrong.json())

    await confirm(form.email)
    const res = await post(login, { email: form.email, password: form.password })
    expect(res.status).toBe(200)
    const names = res.headers.getSetCookie().map((c) => c.split("=")[0])
    expect(names).toContain("app_session")
    expect(names.some((n) => n.endsWith("session_token"))).toBe(true)
    expect(await getDb().select().from(sessions)).toHaveLength(1)
  })

  it("says the same for a wrong password and an unknown email", async () => {
    await post(signup, form)
    await confirm(form.email)
    const wrong = await post(login, { email: form.email, password: "not-the-password!!" })
    const unknown = await post(login, { email: "nobody@example.com", password: form.password })
    expect([wrong.status, unknown.status]).toEqual([401, 401])
    expect(await wrong.json()).toEqual(await unknown.json())
  })

  it("puts a paid tier in the session for a subscriber", async () => {
    await post(signup, form)
    await confirm(form.email)
    const [user] = await getDb().select().from(users)
    await getDb().insert(subscriptions).values({ userId: user.id, planName: "pro", price: 5, endDate: new Date("2099-01-01") })
    const res = await post(login, { email: form.email, password: form.password })
    const token = res.headers.getSetCookie().find((c) => c.startsWith("app_session="))!.split(";")[0].split("=")[1]
    expect(JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())).toMatchObject({ sub: user.id, tier: "paid" })
  })
})

describe("requests from other sites", () => {
  it("are refused, so another site can't log a visitor into its account", async () => {
    await post(signup, form)
    await confirm(form.email)
    const creds = { email: form.email, password: form.password }
    const crossSite: Record<string, string>[] = [{ origin: "https://evil.example" }, { "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }]
    for (const headers of crossSite) {
      for (const handler of [login, signup, logout]) {
        const res = await post(handler, handler === signup ? { ...form, email: "x@example.com", username: "x_user" } : creds, headers)
        expect(res.status).toBe(403)
        expect(res.headers.getSetCookie()).toEqual([])
      }
    }
    expect(await getDb().select().from(users).where(eq(users.email, "x@example.com"))).toEqual([])
    const ours = await post(login, creds, { origin: "http://localhost:3000", "sec-fetch-site": "same-origin" })
    expect(ours.status).toBe(200)
  })
})

describe("rate limits", () => {
  it("stop repeated logins from one address, counted in the database", async () => {
    vi.stubEnv("NODE_ENV", "development")
    resetServerConfigForTests()
    resetAuthForTests()
    try {
      const attempt = (ip: string) => post(login, { email: "ash@example.com", password: "guess-guess-guess!" }, { "x-real-ip": ip })
      const statuses = []
      for (let i = 0; i < 4; i++) statuses.push((await attempt("203.0.113.7")).status)
      expect(statuses).toEqual([401, 401, 401, 429])
      expect((await attempt("203.0.113.8")).status).toBe(401)
      const [{ n }] = await sql<{ n: number }[]>`select count(*)::int as n from auth_rate_limits`
      expect(n).toBeGreaterThan(0)
    } finally {
      vi.unstubAllEnvs()
      resetServerConfigForTests()
      resetAuthForTests()
    }
  })
})

describe("logout", () => {
  it("revokes the Better Auth session and clears both cookies", async () => {
    await post(signup, form)
    await confirm(form.email)
    const signedIn = await post(login, { email: form.email, password: form.password })
    const res = await post(logout, {}, { cookie: cookieHeader(signedIn) })
    expect(res.status).toBe(200)
    expect(await getDb().select().from(sessions)).toHaveLength(0)
    expect(res.headers.getSetCookie().find((c) => c.startsWith("app_session="))).toMatch(/Expires=Thu, 01 Jan 1970/)
  })

  it("still signs out of the app without a Better Auth session", async () => {
    const res = await post(logout, {})
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().some((c) => c.startsWith("app_session=;"))).toBe(true)
  })
})

describe("current user", () => {
  it("returns the profile from our database", async () => {
    await post(signup, form)
    const [user] = await getDb().select().from(users)
    const res = await currentUser(new NextRequest("http://localhost:3000/api/auth/user", { headers: { "x-user-id": user.id } }))
    expect(await res.json()).toEqual({ user: { id: user.id, username: "ash", full_name: "Ash Ketchum", metadata: null } })
  })
})

describe("the dev user", () => {
  it("is only for local databases", () => {
    expect(isLocalDatabase("postgres://u:p@localhost:5433/pokefindr")).toBe(true)
    expect(isLocalDatabase("postgres://u:p@db:5432/pokefindr")).toBe(true)
    expect(isLocalDatabase("postgres://u:p@ep-cool-frog.us-east-2.aws.neon.tech/neondb")).toBe(false)
    expect(isLocalDatabase(undefined)).toBe(false)
  })

  it("is added once, and can log in", async () => {
    expect(await seedDevUser(sql)).toBe(true)
    expect(await seedDevUser(sql)).toBe(false)
    const res = await post(login, { email: DEV_USER.email, password: DEV_USER.password })
    expect(res.status).toBe(200)
  })
})
