import { takeToken } from "@/server/lib/rate-limit"
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
    return takeToken(this.buckets, `${rule.name}:${key}`, { ...rule, maxKeys: this.maxKeys }, this.now())
  }
}
