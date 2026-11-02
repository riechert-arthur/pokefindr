// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { parse } from "cookie"
import { jwtVerify } from "jose"

vi.mock("server-only", () => ({}))

import { resetServerConfigForTests } from "@/server/config"
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  createSessionCookie,
} from "@/server/auth/session"

const SECRET = "test-secret"

describe("session cookies", () => {
  beforeEach(() => {
    resetServerConfigForTests()
    vi.stubEnv("APP_URL", "https://pokefindr.example")
    vi.stubEnv("JWT_SECRET", SECRET)
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co")
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service")
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerConfigForTests()
  })

  it("issues a cookie the middleware can verify", async () => {
    const header = createSessionCookie({ sub: "user-1", email: "a@b.c", tier: "paid" })
    const token = parse(header)[SESSION_COOKIE_NAME]!

    const { payload } = await jwtVerify(token, new TextEncoder().encode(SECRET))
    expect(payload.sub).toBe("user-1")
    expect(payload.tier).toBe("paid")
    expect(header).toMatch(/HttpOnly/i)
    expect(header).toMatch(/Max-Age=604800/)
  })

  it("marks the cookie Secure in production only", () => {
    vi.stubEnv("NODE_ENV", "production")
    resetServerConfigForTests()
    expect(createSessionCookie({ sub: "u", tier: "free" })).toMatch(/Secure/)

    vi.stubEnv("NODE_ENV", "development")
    resetServerConfigForTests()
    expect(createSessionCookie({ sub: "u", tier: "free" })).not.toMatch(/Secure/)
  })

  it("clears the cookie", () => {
    expect(clearSessionCookie()).toMatch(
      new RegExp(`^${SESSION_COOKIE_NAME}=;.*Expires=Thu, 01 Jan 1970`)
    )
  })
})
