import "server-only"
import type { NextRequest } from "next/server"
import { getAuth, IDENTITY_BASE_PATH } from "@/server/auth/auth"
import { getServerConfig } from "@/server/config"

/**
 * The client's IP as the host reports it: Vercel sets x-real-ip and the
 * first x-forwarded-for hop, replacing anything the client sent. Self-hosted,
 * the proxy in front of the app must do the same.
 */
export function clientIp(req: Request): string | undefined {
  return req.headers.get("x-real-ip")?.trim() || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined
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
  return getAuth().handler(
    new Request(new URL(`${IDENTITY_BASE_PATH}${path}`, APP_URL), { method: "POST", headers, body: JSON.stringify(body ?? {}) }),
  )
}

/** The Set-Cookie headers of a Better Auth response (its session cookie), to pass on to the browser. */
export function identityCookies(res: Response): string[] {
  return res.headers.getSetCookie()
}
