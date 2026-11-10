import "server-only"
import { sql } from "drizzle-orm"
import type { Database } from "@/server/db/client"
import type { RateDecision, RateRule, SharedRateLimiter } from "@/server/ports/rate-limiter"

/**
 * Buckets in Postgres (`api_rate_limits`), so every server instance spends
 * from the same budget (#199). One statement per request: it refills the
 * bucket for the time since its last request, takes a token if there's a
 * whole one, and says whether it did. Rows idle for a day are pruned now and
 * then.
 */
export class PostgresRateLimiter implements SharedRateLimiter {
  constructor(private db: () => Database, private pruneChance = 0.001) {}

  async take(rule: RateRule, key: string): Promise<RateDecision> {
    const perSecond = rule.perMinute / 60
    const rows = await this.db().execute<{ allowed: boolean; tokens: number }>(sql`
      insert into api_rate_limits as r (key, tokens, allowed, updated_at)
      values (${`${rule.name}:${key}`}, ${rule.burst - 1}, true, now())
      on conflict (key) do update set
        allowed = least(${rule.burst}::float8, r.tokens + extract(epoch from now() - r.updated_at) * ${perSecond}::float8) >= 1,
        tokens = least(${rule.burst}::float8, r.tokens + extract(epoch from now() - r.updated_at) * ${perSecond}::float8)
          - case when least(${rule.burst}::float8, r.tokens + extract(epoch from now() - r.updated_at) * ${perSecond}::float8) >= 1 then 1 else 0 end,
        updated_at = now()
      returning allowed, tokens`)
    if (Math.random() < this.pruneChance) {
      this.db().execute(sql`delete from api_rate_limits where updated_at < now() - interval '1 day'`).catch((err) => console.error("[rate-limit] couldn't prune", err))
    }
    const [row] = rows
    if (row.allowed) return { ok: true, retryAfter: 0 }
    return { ok: false, retryAfter: Math.max(1, Math.ceil((1 - Number(row.tokens)) / perSecond)) }
  }
}
