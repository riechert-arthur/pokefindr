import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { eq } from "drizzle-orm"
import { POST as callback } from "@/app/api/auth/callback/route"
import { POST as onboarding } from "@/app/api/auth/onboarding/route"
import { getAuth, resetAuthForTests } from "@/server/auth/auth"
import { resetServerConfigForTests } from "@/server/config"
import { getDb } from "@/server/db/client"
import { profiles, users } from "@/server/db/schema"
import { closeTestConnection, insertProfiles } from "./testDatabase"

afterAll(closeTestConnection)
beforeEach(() => resetAuthForTests())

const APP = "http://localhost:3000"
const post = (handler: (r: NextRequest) => Promise<Response>, body: unknown, cookie?: string) =>
  handler(new NextRequest(`${APP}/api/auth/x`, { method: "POST", body: JSON.stringify(body), headers: cookie ? { cookie } : {} }))

/** A Better Auth user with a session but no profile yet: where a new OAuth user is after the provider sends them back. */
async function newOAuthUser(email = "gary@example.com") {
  const { user } = await getAuth().api.signUpEmail({ body: { email, password: "a-long-password-1234!", name: "Gary Oak" } })
  await getDb().update(users).set({ emailVerified: true }).where(eq(users.id, user.id))
  const { headers } = await getAuth().api.signInEmail({ body: { email, password: "a-long-password-1234!" }, returnHeaders: true })
  return { id: user.id, cookie: headers.getSetCookie().map((c) => c.split(";")[0]).join("; ") }
}

describe("after OAuth", () => {
  it("asks a new user for a username, then signs them in", async () => {
    const { id, cookie } = await newOAuthUser()
    expect((await post(callback, {}, cookie)).status).toBe(204)

    const res = await post(onboarding, { username: "gary" }, cookie)
    expect(res.status).toBe(200)
    expect(res.headers.getSetCookie().some((c) => c.startsWith("app_session="))).toBe(true)
    expect(await getDb().select().from(profiles)).toMatchObject([{ id, username: "gary", fullName: "Gary Oak", onboarded: true }])

    // Next time, straight in.
    const again = await post(callback, {}, cookie)
    expect(again.status).toBe(200)
    expect(again.headers.getSetCookie().some((c) => c.startsWith("app_session="))).toBe(true)
  })

  it("needs a Better Auth session", async () => {
    expect((await post(callback, {})).status).toBe(401)
    expect((await post(onboarding, { username: "gary" })).status).toBe(401)
  })

  it("checks the username", async () => {
    await insertProfiles(getDb(), { id: crypto.randomUUID(), username: "Ash" })
    const { cookie } = await newOAuthUser()
    expect((await post(onboarding, { username: "ash" }, cookie)).status).toBe(409)
    expect((await post(onboarding, { username: "no spaces" }, cookie)).status).toBe(422)
    expect((await post(onboarding, { username: "ab" }, cookie)).status).toBe(422)
  })
})

describe("OAuth providers", () => {
  it("sends people to Google with our callback when Google is configured", async () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client.apps.googleusercontent.com")
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret")
    resetServerConfigForTests()
    resetAuthForTests()
    try {
      const res = await getAuth().handler(
        new Request(`${APP}/api/identity/sign-in/social`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: APP },
          body: JSON.stringify({ provider: "google", callbackURL: "/login/callback", disableRedirect: true }),
        }),
      )
      const { url } = (await res.json()) as { url: string }
      const google = new URL(url)
      expect(google.host).toBe("accounts.google.com")
      expect(google.searchParams.get("redirect_uri")).toBe(`${APP}/api/identity/callback/google`)
      expect(google.searchParams.get("client_id")).toBe("test-client.apps.googleusercontent.com")
    } finally {
      vi.unstubAllEnvs()
      resetServerConfigForTests()
      resetAuthForTests()
    }
  })

  /** Signs in through a fake Discord that reports this email and whether it checked it; returns the redirect. */
  async function discordSignIn(email: string, verified: boolean) {
    vi.stubEnv("DISCORD_CLIENT_ID", "discord-id")
    vi.stubEnv("DISCORD_CLIENT_SECRET", "discord-secret")
    resetServerConfigForTests()
    resetAuthForTests()
    const realFetch = globalThis.fetch
    const discord = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url.startsWith("https://discord.com/api/oauth2/token"))
        return Response.json({ access_token: "at", token_type: "Bearer", expires_in: 3600, scope: "identify email" })
      if (url.startsWith("https://discord.com/api/users/"))
        return Response.json({ id: "4242", username: "trainer", email, verified, avatar: null, discriminator: "0" })
      return realFetch(input, init)
    })
    try {
      const start = await getAuth().handler(
        new Request(`${APP}/api/identity/sign-in/social`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: APP },
          body: JSON.stringify({ provider: "discord", callbackURL: "/login/callback", errorCallbackURL: "/login?oauth=failed", disableRedirect: true }),
        }),
      )
      const state = new URL(((await start.json()) as { url: string }).url).searchParams.get("state")!
      const cookie = start.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ")
      const res = await getAuth().handler(new Request(`${APP}/api/identity/callback/discord?code=c&state=${state}`, { headers: { cookie } }))
      const signedIn = res.headers.getSetCookie().some((c) => c.includes("session_token=") && !c.includes("Max-Age=0"))
      return { location: res.headers.get("location"), signedIn }
    } finally {
      discord.mockRestore()
      vi.unstubAllEnvs()
      resetServerConfigForTests()
      resetAuthForTests()
    }
  }

  it("won't make an account from an email Discord hasn't confirmed", async () => {
    // Someone signing up as the owner of an address they don't have.
    const { location, signedIn } = await discordSignIn("victim@example.com", false)
    expect(location).toMatch(/^\/login\?oauth=failed&error=/)
    expect(signedIn).toBe(false)
    expect(await getDb().select().from(users).where(eq(users.email, "victim@example.com"))).toEqual([])
  })

  it("fails the same way for an unconfirmed email whether or not it has an account", async () => {
    const free = await discordSignIn("nobody@example.com", false)
    await newOAuthUser("taken@example.com")
    const taken = await discordSignIn("taken@example.com", false)
    expect(taken.location).toBe(free.location)
    expect(taken.signedIn).toBe(false)
  })

  it("makes an account from an email Discord has confirmed", async () => {
    const { location, signedIn } = await discordSignIn("ash@example.com", true)
    expect(location).toBe("/login/callback")
    expect(signedIn).toBe(true)
    const [user] = await getDb().select().from(users).where(eq(users.email, "ash@example.com"))
    expect(user.emailVerified).toBe(true)
  })

  it("refuses a provider that isn't configured", async () => {
    const res = await getAuth().handler(
      new Request(`${APP}/api/identity/sign-in/social`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: APP },
        body: JSON.stringify({ provider: "discord", callbackURL: "/login/callback" }),
      }),
    )
    expect(res.status).toBeGreaterThanOrEqual(400)
  })
})
