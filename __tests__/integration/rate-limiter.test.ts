import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { PostgresRateLimiter } from "@/server/adapters/rate-limiter/postgres"
import { getDb } from "@/server/db/client"
import { closeTestConnection } from "./testDatabase"

const rule = { name: "test", perMinute: 6, burst: 3 }

beforeEach(async () => {
  await getDb().execute(sql`truncate api_rate_limits`)
})
afterAll(closeTestConnection)

describe("PostgresRateLimiter (#199)", () => {
  it("gives two server instances one budget per client", async () => {
    const one = new PostgresRateLimiter(getDb, 0)
    const two = new PostgresRateLimiter(getDb, 0)
    const taken = [await one.take(rule, "203.0.113.7"), await two.take(rule, "203.0.113.7"), await one.take(rule, "203.0.113.7")]
    expect(taken.every((d) => d.ok)).toBe(true)
    const refused = await two.take(rule, "203.0.113.7")
    expect(refused.ok).toBe(false)
    // 6 a minute: a token every 10 seconds.
    expect(refused.retryAfter).toBeGreaterThan(8)
    expect(refused.retryAfter).toBeLessThanOrEqual(10)
    expect((await one.take(rule, "2001:db8:1:2::/64")).ok).toBe(true)
  })

  it("refills with time, and keeps a refusal from costing a token", async () => {
    const limiter = new PostgresRateLimiter(getDb, 0)
    for (let i = 0; i < 3; i++) await limiter.take(rule, "a")
    expect((await limiter.take(rule, "a")).ok).toBe(false)
    expect((await limiter.take(rule, "a")).ok).toBe(false)
    // Ten seconds ago is one token back, however many refusals came in between.
    await getDb().execute(sql`update api_rate_limits set updated_at = updated_at - interval '10 seconds'`)
    expect((await limiter.take(rule, "a")).ok).toBe(true)
    expect((await limiter.take(rule, "a")).ok).toBe(false)
  })

  it("takes concurrent requests one token each", async () => {
    const limiter = new PostgresRateLimiter(getDb, 0)
    const decisions = await Promise.all(Array.from({ length: 8 }, () => limiter.take({ ...rule, burst: 5 }, "b")))
    expect(decisions.filter((d) => d.ok)).toHaveLength(5)
  })
})
