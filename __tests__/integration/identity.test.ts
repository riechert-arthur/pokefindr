import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { eq } from "drizzle-orm"
import { getAuth, identitySecret, resetAuthForTests } from "@/server/auth/auth"
import { getDb } from "@/server/db/client"
import { accounts, profiles, users } from "@/server/db/schema"
import { closeTestConnection } from "./testDatabase"

afterAll(closeTestConnection)
beforeEach(() => resetAuthForTests())

const base = "http://localhost:3000/api/identity"

describe("Better Auth", () => {
  it("answers on its own base path", async () => {
    const res = await getAuth().handler(new Request(`${base}/ok`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it("creates users with UUIDs a profile can share, and hashes the password", async () => {
    const { user } = await getAuth().api.signUpEmail({ body: { email: "ash@example.com", password: "a-long-password-1234!", name: "Ash" } })
    expect(user.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    const [account] = await getDb().select().from(accounts).where(eq(accounts.userId, user.id))
    expect(account.providerId).toBe("credential")
    expect(account.password).toBeTruthy()
    expect(account.password).not.toContain("a-long-password-1234!")
    await getDb().insert(profiles).values({ id: user.id, username: "ash" })
    // Deleting the user deletes the profile.
    await getDb().delete(users).where(eq(users.id, user.id))
    expect(await getDb().select().from(profiles)).toHaveLength(0)
  })

  it("won't sign in before the email is confirmed", async () => {
    await getAuth().api.signUpEmail({ body: { email: "misty@example.com", password: "a-long-password-1234!", name: "Misty" } })
    await expect(getAuth().api.signInEmail({ body: { email: "misty@example.com", password: "a-long-password-1234!" } })).rejects.toThrow()
  })

  it("refuses short passwords", async () => {
    await expect(getAuth().api.signUpEmail({ body: { email: "brock@example.com", password: "short", name: "Brock" } })).rejects.toThrow()
  })
})

describe("identitySecret", () => {
  it("prefers BETTER_AUTH_SECRET, else derives a different value from JWT_SECRET", () => {
    expect(identitySecret({ BETTER_AUTH_SECRET: "x".repeat(32), JWT_SECRET: "jwt" })).toBe("x".repeat(32))
    const derived = identitySecret({ BETTER_AUTH_SECRET: undefined, JWT_SECRET: "jwt" })
    expect(derived).not.toBe("jwt")
    expect(derived.length).toBeGreaterThanOrEqual(32)
    expect(identitySecret({ BETTER_AUTH_SECRET: undefined, JWT_SECRET: "other" })).not.toBe(derived)
  })
})
