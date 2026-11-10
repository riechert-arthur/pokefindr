import "server-only"
import { apiError } from "@/server/api-error"
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
} as const satisfies Record<string, RateRule>

/**
 * A 429 with Retry-After once the client's bucket for `rule` is empty, else
 * null. If the store can't be reached, the request goes through: a limiter
 * outage shouldn't take the map down.
 */
export async function limitClient(request: Request, rule: RateRule): Promise<Response | null> {
  try {
    const { ok, retryAfter } = await getRateLimiter().take(rule, rateLimitKey(clientIp(request.headers)))
    if (ok) return null
    return apiError("tooManyRequests", "Too many requests. Wait a moment and try again.", 429, {}, { headers: { "Retry-After": String(retryAfter) } })
  } catch (err) {
    console.error(`[rate-limit] couldn't check ${rule.name}; letting the request through`, err)
    return null
  }
}
