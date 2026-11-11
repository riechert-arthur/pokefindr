// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { SignJWT } from "jose"
import { middleware, publicDetection } from "@/middleware"
import { PUBLIC_LOCALES } from "@/i18n/routing"

beforeAll(() => {
  process.env.JWT_SECRET ??= "test-secret-at-least-32-characters-long"
})

describe("middleware without a session", () => {
  it("answers API calls with a 401 instead of a redirect", async () => {
    const res = await middleware(new NextRequest("http://localhost/api/locations/abc/reports", { method: "POST" }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: "Log in to continue", code: "loginRequired" })
  })

  it("sends pages to /login", async () => {
    const res = await middleware(new NextRequest("http://localhost/settings"))
    expect(res.status).toBe(307)
    expect(res.headers.get("location")).toBe("http://localhost/login")
    for (const path of ["/moderate", "/es/moderate?tab=reports"]) {
      expect((await middleware(new NextRequest(`http://localhost${path}`))).headers.get("location"), path).toMatch(/\/login(\?|$)/)
    }
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

  it("sets no hreflang header, and no language cookie for a browser already in English", async () => {
    const res = await middleware(new NextRequest("http://localhost/map", { headers: { "accept-language": "en-US,en;q=0.9" } }))
    expect(res.headers.get("set-cookie")).toBeNull()
    expect(res.headers.get("link")).toBeNull()
  })

  it("keeps a visit to another language in the language cookie for a year, once languages are detected (#182)", async () => {
    // Spanish: no cookie while it isn't public, so nothing saves English for a year either.
    const es = await middleware(new NextRequest("http://localhost/es/map", { headers: { "accept-language": "en-US,en;q=0.9" } }))
    const en = await middleware(new NextRequest("http://localhost/map", { headers: { "accept-language": "es-ES,es;q=0.9" } }))
    if (PUBLIC_LOCALES.includes("es")) {
      expect(es.headers.get("set-cookie")).toMatch(/^NEXT_LOCALE=es; Path=\/; .*Max-Age=31536000/)
    } else {
      expect(es.headers.get("set-cookie")).toBeNull()
      expect(en.headers.get("set-cookie")).toBeNull()
    }
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

  it("checks the session on a percent-encoded path too", async () => {
    for (const [path, login] of [["/%68ome", "/login"], ["/es/%73ettings", "/es/login"], ["/%61dmin/reports", "/login"]]) {
      const res = await middleware(new NextRequest(`http://localhost${path}`))
      expect(rewrite(res), path).toBeNull()
      expect(res.headers.get("location"), path).toBe(`http://localhost${login}`)
    }
  })

  it("lets a malformed percent-encoding through to the 404 instead of throwing", async () => {
    const res = await middleware(new NextRequest("http://localhost/%E0%A4%A"))
    expect(res.status).not.toBe(500)
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

describe("detection only picks a public language (docs/i18n.md)", () => {
  it("drops languages that aren't public from Accept-Language and the cookie", () => {
    // "fr" stands in for a language in LOCALES that isn't public yet.
    const headers = publicDetection(new Headers({ "accept-language": "fr-FR,fr;q=0.9,es;q=0.8,*;q=0.1", cookie: "a=1; NEXT_LOCALE=fr; b=2" }))
    expect(headers.get("accept-language")).toBe("es;q=0.8,*;q=0.1")
    expect(headers.get("cookie")).toBe("a=1; b=2")
    const none = publicDetection(new Headers({ "accept-language": "fr", cookie: "NEXT_LOCALE=fr" }))
    expect(none.get("accept-language")).toBeNull()
    expect(none.get("cookie")).toBeNull()
    expect(publicDetection(new Headers({ cookie: "NEXT_LOCALE=es" })).get("cookie")).toBe("NEXT_LOCALE=es")
  })
})
