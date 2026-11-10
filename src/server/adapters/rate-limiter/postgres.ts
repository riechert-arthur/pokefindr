import "server-only"
import { sql } from "drizzle-orm"
import { z } from "zod/v3"
import { getDb, type Database } from "@/server/db/client"
import { defineJob } from "@/server/lib/jobs/types"
import type { RateDecision, RateRule, SharedRateLimiter } from "@/server/ports/rate-limiter"
import { timed } from "@/server/log"

/**
 * Buckets in Postgres (`api_rate_limits`), so every server instance spends
 * from the same budget (#199). One statement per request: it refills the
 * bucket for the time since its last request, takes a token if there's a
 * whole one, and says whether it did. Idle rows are pruned by the daily
 * `prune-rate-limits` job.
 *
 * A client this instance has just refused is refused again from memory until
 * its Retry-After, so a burst from one scraper doesn't queue on its row.
 */
export class PostgresRateLimiter implements SharedRateLimiter {
  private refusedUntil = new Map<string, number>()

  constructor(private db: () => Database, private now: () => number = Date.now, private maxRefused = 10_000) {}

  async take(rule: RateRule, key: string): Promise<RateDecision> {
    const id = `${rule.name}:${key}`
    const until = this.refusedUntil.get(id)
    if (until !== undefined && until > this.now()) return { ok: false, retryAfter: Math.ceil((until - this.now()) / 1000) }
    this.refusedUntil.delete(id)

    const perSecond = rule.perMinute / 60
    // The bucket refilled for the time since its last request (never less than it was).
    const refilled = sql`least(${rule.burst}::float8, r.tokens + greatest(0, extract(epoch from clock_timestamp() - r.updated_at)) * ${perSecond}::float8)`
    const [row] = await timed("rateLimit.take", () => this.db().execute<{ allowed: boolean; tokens: number }>(sql`
      insert into api_rate_limits as r (key, tokens, allowed, updated_at)
      values (${id}, ${rule.burst - 1}, true, clock_timestamp())
      on conflict (key) do update set
        allowed = ${refilled} >= 1,
        tokens = ${refilled} - case when ${refilled} >= 1 then 1 else 0 end,
        updated_at = clock_timestamp()
      returning allowed, tokens`))
    if (row.allowed) return { ok: true, retryAfter: 0 }
    const retryAfter = Math.max(1, Math.ceil((1 - Number(row.tokens)) / perSecond))
    if (this.refusedUntil.size >= this.maxRefused) this.refusedUntil.delete(this.refusedUntil.keys().next().value!)
    this.refusedUntil.set(id, this.now() + retryAfter * 1000)
    return { ok: false, retryAfter }
  }
}

/** Deletes buckets idle for a day: a full bucket is the same as no row. */
export async function pruneRateLimits(db: Database): Promise<number> {
  const rows = await db.execute<{ key: string }>(sql`delete from api_rate_limits where updated_at < now() - interval '1 day' returning key`)
  return rows.length
}

export const pruneRateLimitsJob = defineJob({
  description: "Deletes rate-limit buckets idle for a day",
  schema: z.unknown(),
  async run() {
    return { deleted: await pruneRateLimits(getDb()) }
  },
})
