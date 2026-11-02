import "server-only"
import jwt from "jsonwebtoken"
import { serialize } from "cookie"
import { getServerConfig } from "@/server/config"

export const SESSION_COOKIE_NAME = "app_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7

export type SessionTier = "free" | "paid"

export interface SessionClaims {
  sub: string
  email?: string
  tier: SessionTier
}

/** Signs a session JWT and returns it as a `Set-Cookie` header value. */
export function createSessionCookie(claims: SessionClaims): string {
  const { JWT_SECRET, NODE_ENV } = getServerConfig()
  const token = jwt.sign(claims, JWT_SECRET, { expiresIn: SESSION_MAX_AGE_SECONDS })

  return serialize(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

/** Returns a `Set-Cookie` header value that removes the session cookie. */
export function clearSessionCookie(): string {
  const { NODE_ENV } = getServerConfig()
  return serialize(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: NODE_ENV === "production",
    expires: new Date(0),
  })
}
