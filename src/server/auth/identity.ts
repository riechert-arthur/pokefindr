import "server-only"
import { NextResponse, type NextRequest } from "next/server"
import { authHandler, IDENTITY_BASE_PATH } from "@/server/auth/auth"
import { getServerConfig } from "@/server/config"
import { LOCALE_HEADER, requestLocale } from "@/server/i18n"

/**
 * The client's IP as the host reports it: Vercel sets x-real-ip and the
 * first x-forwarded-for hop, replacing anything the client sent. Self-hosted,
 * the proxy in front of the app must do the same.
 */
export function clientIp(req: Request): string | undefined {
  return req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined
}

/**
 * True for a request a page on another site made the browser send: a form
 * that logs the visitor into the attacker's account, say. Browsers mark
 * those with Sec-Fetch-Site, and send an Origin on every POST.
 * identityRequest stands in for the browser, so Better Auth can't check
 * this itself: our routes must, before calling it.
 */
export function crossSite(req: Request): boolean {
  const site = req.headers.get("sec-fetch-site")
  if (site && site !== "same-origin" && site !== "none") return true
  const origin = req.headers.get("origin")
  return Boolean(origin && origin !== new URL(getServerConfig().APP_URL).origin)
}

/** The 403 our routes answer a cross-site request with, or null for one from our own pages. */
export function refuseCrossSite(req: Request): NextResponse | null {
  return crossSite(req) ? NextResponse.json({ error: "This request has to come from PokeFindr itself" }, { status: 403 }) : null
}

/**
 * Calls one of Better Auth's endpoints for a route of ours (sign-up, login,
 * logout), through its HTTP handler rather than `auth.api`, so its rate
 * limits apply: they only run on requests. Passes on the client's IP, which
 * the limits are keyed by, and its cookies (the Better Auth session).
 */
export async function identityRequest(req: NextRequest | Request, path: `/${string}`, body?: unknown): Promise<Response> {
  const { APP_URL } = getServerConfig()
  const headers = new Headers({ "content-type": "application/json", origin: new URL(APP_URL).origin })
  const ip = clientIp(req)
  if (ip) headers.set("x-forwarded-for", ip)
  const cookie = req.headers.get("cookie")
  if (cookie) headers.set("cookie", cookie)
  const userAgent = req.headers.get("user-agent")
  if (userAgent) headers.set("user-agent", userAgent)
  // The page's language, for the emails Better Auth sends from this request (#185).
  headers.set(LOCALE_HEADER, requestLocale(req))
  return authHandler(
    new Request(new URL(`${IDENTITY_BASE_PATH}${path}`, APP_URL), { method: "POST", headers, body: JSON.stringify(body ?? {}) }),
  )
}

/** The Set-Cookie headers of a Better Auth response (its session cookie), to pass on to the browser. */
export function identityCookies(res: Response): string[] {
  return res.headers.getSetCookie()
}
