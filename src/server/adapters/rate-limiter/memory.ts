import type { RateDecision, RateRule, SharedRateLimiter } from "@/server/ports/rate-limiter"

/**
 * Buckets in this instance's memory: for local dev and tests, where there's
 * one server. On serverless each instance would keep its own, so the real
 * limit would be a multiple of the rule's (use the Postgres adapter there).
 */
export class MemoryRateLimiter implements SharedRateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>()

  constructor(private now: () => number = Date.now, private maxKeys = 10_000) {}

  async take(rule: RateRule, key: string): Promise<RateDecision> {
    const id = `${rule.name}:${key}`
    const t = this.now()
    const perMs = rule.perMinute / 60_000
    const b = this.buckets.get(id) ?? { tokens: rule.burst, updated: t }
    b.tokens = Math.min(rule.burst, b.tokens + (t - b.updated) * perMs)
    b.updated = t
    // Least recently used first, so the oldest goes when the map is full.
    this.buckets.delete(id)
    this.buckets.set(id, b)
    if (this.buckets.size > this.maxKeys) this.buckets.delete(this.buckets.keys().next().value!)
    if (b.tokens < 1) return { ok: false, retryAfter: Math.ceil((1 - b.tokens) / perMs / 1000) }
    b.tokens -= 1
    return { ok: true, retryAfter: 0 }
  }
}
