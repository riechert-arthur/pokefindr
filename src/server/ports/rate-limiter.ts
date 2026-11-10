/**
 * Rate limits shared by every server instance (#199). A rule is a token
 * bucket: `burst` requests at once, refilling at `perMinute`.
 */
export interface RateRule {
  /** Keeps each rule's buckets apart: "locations", "geocode". */
  name: string
  perMinute: number
  burst: number
}

export interface RateDecision {
  ok: boolean
  /** Whole seconds until a request would be let through again; 0 when ok. */
  retryAfter: number
}

export interface SharedRateLimiter {
  /** Takes one token from `key`'s bucket for `rule`. */
  take(rule: RateRule, key: string): Promise<RateDecision>
}
