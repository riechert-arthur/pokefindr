import "server-only"
import { apiError } from "@/server/api-error"
import { refuseBots } from "@/server/bot-check"
import { getRateLimiter } from "@/server/container"
import { clientIp, rateLimitKey } from "@/server/lib/rate-limit"
import type { RateRule } from "@/server/ports/rate-limiter"

/**
 * Per-client limits on the public data routes (#199, docs/scraping.md),
 * shared by every server instance. Keyed by IP, and IPv6 by its /64. Under
 * the firewall's limits (#197), which stop a flood before it reaches us.
 */
export const RATE_RULES = {
  /** Panning and searching the map: a few dozen requests a minute at most. */
  locations: { name: "locations", perMinute: 120, burst: 40 },
  /** Type-ahead sends a request every few keystrokes: room for fast typing, not for scraping. */
  geocode: { name: "geocode", perMinute: 60, burst: 20 },
  /** Uploading or removing a profile picture (#290), per account: a few tries, not a stream of files. */
  avatar: { name: "avatar", perMinute: 4, burst: 6 },
} as const satisfies Record<string, RateRule>

/** How long a request waits on the limiter before going through without it. */
const LIMITER_TIMEOUT_MS = 300

/**
 * A 429 with Retry-After once the client's bucket for `rule` is empty, else
 * null. The bucket is the client's IP unless `key` names another (a user
 * id). If the store fails or is slow (LIMITER_TIMEOUT_MS), the request goes
 * through: a limiter outage shouldn't take the map down.
 */
export async function limitClient(request: Request, rule: RateRule, key?: string): Promise<Response | null> {
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${LIMITER_TIMEOUT_MS} ms`)), LIMITER_TIMEOUT_MS).unref?.())
    const { ok, retryAfter } = await Promise.race([getRateLimiter().take(rule, key ?? rateLimitKey(clientIp(request.headers))), timeout])
    if (ok) return null
    return apiError("tooManyRequests", "Too many requests. Wait a moment and try again.", 429, {}, { headers: { "Retry-After": String(retryAfter) } })
  } catch (err) {
    console.error(`[rate-limit] couldn't check ${rule.name}; letting the request through`, err)
    return null
  }
}

/**
 * The checks a data route runs first (docs/scraping.md): the client's rate
 * limit for `rule` and, with `bots`, BotID (#198), side by side. A bot gets
 * BotID's 403, anyone else over the limit a 429; null means go ahead.
 */
export async function guardRoute(request: Request, rule: RateRule, { bots = false }: { bots?: boolean } = {}): Promise<Response | null> {
  const [refused, limited] = await Promise.all([bots ? refuseBots() : null, limitClient(request, rule)])
  return refused ?? limited
}
