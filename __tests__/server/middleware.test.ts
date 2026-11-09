// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { SignJWT } from "jose"
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

describe("middleware and the language (#177)", () => {
  const session = async (sub: string) =>
    `app_session=${await new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(sub).setExpirationTime("1h").sign(new TextEncoder().encode(process.env.JWT_SECRET))}`
  const rewrite = (res: Response) => res.headers.get("x-middleware-rewrite")

  it("serves English pages without a prefix and other languages with one", async () => {
    expect(rewrite(await middleware(new NextRequest("http://localhost/map?state=WA")))).toBe("http://localhost/en/map?state=WA")
    const es = await middleware(new NextRequest("http://localhost/es/map"))
    expect(rewrite(es) ?? es.headers.get("x-middleware-next")).toBeTruthy()
    expect(es.headers.get("location")).toBeNull()
  })

  it("sets no cookie and no hreflang header while English is the only public language", async () => {
    const res = await middleware(new NextRequest("http://localhost/map"))
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("link")).toBeNull()
  })

  it("drops a prefix English doesn't need", async () => {
    const res = await middleware(new NextRequest("http://localhost/en/map"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost/map")
  })

  it("sends a signed-out visitor to the login page in their language", async () => {
    const res = await middleware(new NextRequest("http://localhost/es/settings"))
    expect(res.headers.get("location")).toBe("http://localhost/es/login")
  })

  it("passes the verified user to signed-in pages in any language", async () => {
    const res = await middleware(new NextRequest("http://localhost/es/home", { headers: { cookie: await session("user-1") } }))
    expect(res.headers.get("x-middleware-request-x-user-id")).toBe("user-1")
  })

  it("removes an identity a client sent itself", async () => {
    const res = await middleware(new NextRequest("http://localhost/map", { headers: { "x-user-id": "someone-else", "x-user-tier": "paid" } }))
    expect(res.headers.get("x-middleware-request-x-user-id")).toBeNull()
    expect(res.headers.get("x-middleware-request-x-user-tier")).toBeNull()
    // Next keeps only the headers listed here, so the client's are dropped.
    expect(res.headers.get("x-middleware-override-headers")?.split(",")).not.toContain("x-user-id")
  })
})
