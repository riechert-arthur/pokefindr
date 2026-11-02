// @vitest-environment node
import { describe, it, expect, beforeAll, vi } from "vitest"
import { NextRequest } from "next/server"
import { SignJWT } from "jose"

vi.mock("server-only", () => ({}))

const SECRET = "middleware-test-secret"

beforeAll(() => {
  vi.stubEnv("APP_URL", "http://localhost:3000")
  vi.stubEnv("JWT_SECRET", SECRET)
  vi.stubEnv("DATABASE_URL", "postgres://u:p@localhost:5432/db")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321")
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon")
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service")
})

const { middleware } = await import("@/middleware")

async function sessionCookie(sub: string) {
  const token = await new SignJWT({ tier: "free" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(sub)
    .sign(new TextEncoder().encode(SECRET))
  return `app_session=${token}`
}

function request(path: string, init: { method?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(new URL(path, "http://localhost:3000"), init)
}

/** The request headers middleware forwards to the route handler. */
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`)

describe("middleware", () => {
  it("lets anyone read location reviews, without any identity", async () => {
    const res = await middleware(
      request("/api/locations/abc/reviews", { headers: { "x-user-id": "spoofed" } }),
    )
    expect(res.status).toBe(200)
    expect(forwarded(res, "x-user-id")).toBeNull()
  })

  it("returns 401 JSON for API writes without a session", async () => {
    const res = await middleware(request("/api/locations/abc/reviews", { method: "POST" }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Unauthenticated" })
  })

  it("redirects pages to /login without a session", async () => {
    const res = await middleware(request("/home"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost:3000/login")
  })

  it("rejects a cookie signed with the wrong secret", async () => {
    const forged = await new SignJWT({})
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("victim")
      .sign(new TextEncoder().encode("wrong"))
    const res = await middleware(
      request("/api/my-reviews", { headers: { cookie: `app_session=${forged}` } }),
    )
    expect(res.status).toBe(401)
  })

  it("forwards the verified user id and overrides a spoofed header", async () => {
    const res = await middleware(
      request("/api/locations/abc/reviews", {
        method: "POST",
        headers: { cookie: await sessionCookie("user-1"), "x-user-id": "spoofed" },
      }),
    )
    expect(res.status).toBe(200)
    expect(forwarded(res, "x-user-id")).toBe("user-1")
    expect(forwarded(res, "x-user-tier")).toBe("free")
  })
})
