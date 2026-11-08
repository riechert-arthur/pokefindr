import { beforeAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { middleware } from "@/middleware"

beforeAll(() => {
  process.env.JWT_SECRET ??= "test-secret-at-least-32-characters-long"
})

describe("middleware without a session", () => {
  it("answers API calls with a 401 instead of a redirect", async () => {
    const res = await middleware(new NextRequest("http://localhost/api/locations/abc/reports", { method: "POST" }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Log in to continue" })
  })

  it("sends pages to /login", async () => {
    const res = await middleware(new NextRequest("http://localhost/settings"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost/login")
  })

  it("treats a bad token on an API call as signed out", async () => {
    const req = new NextRequest("http://localhost/api/reviews", { method: "POST", headers: { cookie: "app_session=not-a-jwt" } })
    expect((await middleware(req)).status).toBe(401)
  })
})
