import "server-only"
import { apiError } from "@/server/api-error"
import { refuseBots } from "@/server/bot-check"
import { getRateLimiter } from "@/server/container"
import { clientIp, rateLimitKey } from "@/server/lib/rate-limit"
import type { RateRule } from "@/server/ports/rate-limiter"
import { log, sampled } from "@/server/log"

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

/** One 429 in this many is logged (security.rate_limited). */
const LIMITED_SAMPLE = 10

/**
 * The start of an IP, for logs: the /24 for IPv4 (`203.0.113.0/24`), the
 * /64 for IPv6 (as the limiter keys it). Never the whole address.
 */
export function ipPrefix(ip: string): string {
  const key = rateLimitKey(ip)
  const v4 = /^(\d+\.\d+\.\d+)\.\d+$/.exec(key)
  if (v4) return `${v4[1]}.0/24`
  return key.endsWith("::/64") ? key : "unknown"
}

/** How long a request waits on the limiter before going through without it. */
const LIMITER_TIMEOUT_MS = 300

/**
 * A 429 with Retry-After once the client's bucket for `rule` is empty, else
 * null. If the store fails or is slow (LIMITER_TIMEOUT_MS), the request goes
 * through: a limiter outage shouldn't take the map down.
 */
export async function limitClient(request: Request, rule: RateRule): Promise<Response | null> {
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`no answer in ${LIMITER_TIMEOUT_MS} ms`)), LIMITER_TIMEOUT_MS).unref?.())
    const ip = clientIp(request.headers)
    const { ok, retryAfter } = await Promise.race([getRateLimiter().take(rule, rateLimitKey(ip)), timeout])
    if (ok) return null
    // A scraper earns one a second: a sample is enough to see it.
    if (sampled(LIMITED_SAMPLE)) log.forRequest(request, new URL(request.url).pathname).info("security.rate_limited", { rule: rule.name, ipPrefix: ipPrefix(ip), retryAfter, sample: LIMITED_SAMPLE })
    return apiError("tooManyRequests", "Too many requests. Wait a moment and try again.", 429, {}, { headers: { "Retry-After": String(retryAfter) } })
  } catch (err) {
    log.forRequest(request).logError("rate_limit.check_failed", err, { rule: rule.name })
    return null
  }
}

/**
 * The checks a data route runs first (docs/scraping.md): the client's rate
 * limit for `rule` and, with `bots`, BotID (#198), side by side. A bot gets
 * BotID's 403, anyone else over the limit a 429; null means go ahead.
 */
export async function guardRoute(request: Request, rule: RateRule, { bots = false }: { bots?: boolean } = {}): Promise<Response | null> {
  const [refused, limited] = await Promise.all([bots ? refuseBots(new URL(request.url).pathname) : null, limitClient(request, rule)])
  return refused ?? limited
}
