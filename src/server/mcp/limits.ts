import "server-only"
import { clientIp, rateLimitKey, tokenBucket } from "@/server/lib/rate-limit"
import { PLACES_PER_DAY, utcDay, type PlaceBudget } from "@/server/assistant/limits"

/**
 * Per-client limits for the MCP server (#133). A client is its IP (an IPv6
 * /64) without a token, or its user once signed in. Like the assistant's
 * per-minute bucket, these live in this instance's memory until the shared
 * limiter (#199) lands, so with several instances the real limit is a
 * multiple of these.
 */

/** Requests (any MCP message) one client may send a minute. */
export const MCP_REQUESTS_PER_MINUTE = 30
/** Distinct places one client is shown a day, as the assistant caps it: the map has the rest. */
export const MCP_PLACES_PER_DAY = PLACES_PER_DAY
const MAX_CLIENTS = 10_000

let perMinute = tokenBucket({ perMinute: MCP_REQUESTS_PER_MINUTE, burst: MCP_REQUESTS_PER_MINUTE, maxKeys: MAX_CLIENTS })
const budgets = new Map<string, { day: string; budget: PlaceBudget }>()

/** The client a request comes from, for its limits. */
export const clientKeyFor = (headers: Headers) => `ip:${rateLimitKey(clientIp(headers))}`

/** Takes one request from the client's bucket; false when it's sending too fast. */
export const takeRequest = (key: string) => perMinute.take(key)

/**
 * The places the client may still be shown today. The same object is kept
 * for the day, so the tools' counting carries across requests.
 */
export function placeBudgetFor(key: string, now: Date): PlaceBudget {
  const day = utcDay(now)
  let entry = budgets.get(key)
  if (!entry || entry.day !== day) entry = { day, budget: { left: MCP_PLACES_PER_DAY, seen: new Set(), added: [] } }
  // Nothing is saved from `added` here; keep it from growing.
  entry.budget.added.length = 0
  // Re-insert so the oldest client is first, and drop it past the cap.
  budgets.delete(key)
  budgets.set(key, entry)
  if (budgets.size > MAX_CLIENTS) budgets.delete(budgets.keys().next().value!)
  return entry.budget
}

/** Test helper: forget every client. */
export function resetMcpLimitsForTests() {
  perMinute = tokenBucket({ perMinute: MCP_REQUESTS_PER_MINUTE, burst: MCP_REQUESTS_PER_MINUTE, maxKeys: MAX_CLIENTS })
  budgets.clear()
}
