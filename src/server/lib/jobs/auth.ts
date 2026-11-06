import "server-only"
import { createHash, timingSafeEqual } from "node:crypto"

/**
 * Checks `Authorization: Bearer <secret>` in constant time. Both sides are
 * hashed first so the comparison doesn't leak the secret's length. Returns
 * false when no secret is configured, so jobs stay closed until one is set.
 */
export function isAuthorizedJobRequest(authorization: string | null, secret: string | undefined): boolean {
  if (!secret || !authorization) return false
  const digest = (value: string) => createHash("sha256").update(value).digest()
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`))
}
