import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { sql } from "drizzle-orm"
import { PostgresRateLimiter, pruneRateLimits } from "@/server/adapters/rate-limiter/postgres"
import { getDb } from "@/server/db/client"
import { jobs } from "@/server/lib/jobs/registry"
import vercel from "../../vercel.json"
import { closeTestConnection } from "./testDatabase"

const rule = { name: "test", perMinute: 6, burst: 3 }

beforeEach(async () => {
  await getDb().execute(sql`truncate api_rate_limits`)
})
afterAll(closeTestConnection)

describe("PostgresRateLimiter (#199)", () => {
  it("gives two server instances one budget per client", async () => {
    const one = new PostgresRateLimiter(getDb)
    const two = new PostgresRateLimiter(getDb)
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
    let now = 0
    const limiter = new PostgresRateLimiter(getDb, () => now)
    for (let i = 0; i < 3; i++) await limiter.take(rule, "a")
    expect((await limiter.take(rule, "a")).ok).toBe(false)
    // Ten seconds later is one token back, however many refusals came in between.
    await getDb().execute(sql`update api_rate_limits set updated_at = updated_at - interval '10 seconds'`)
    now += 10_000
    expect((await limiter.take(rule, "a")).ok).toBe(true)
    expect((await limiter.take(rule, "a")).ok).toBe(false)
  })

  it("answers a client it just refused from memory, without touching its row", async () => {
    const limiter = new PostgresRateLimiter(getDb, () => 0)
    for (let i = 0; i < 4; i++) await limiter.take(rule, "b")
    const [before] = await getDb().execute<{ updated_at: string }>(sql`select updated_at::text from api_rate_limits`)
    expect(await limiter.take(rule, "b")).toMatchObject({ ok: false })
    const [after] = await getDb().execute<{ updated_at: string }>(sql`select updated_at::text from api_rate_limits`)
    expect(after.updated_at).toBe(before.updated_at)
  })

  it("takes concurrent requests one token each", async () => {
    const limiter = new PostgresRateLimiter(getDb)
    const decisions = await Promise.all(Array.from({ length: 8 }, () => limiter.take({ ...rule, burst: 5 }, "c")))
    expect(decisions.filter((d) => d.ok)).toHaveLength(5)
  })

  it("prunes buckets idle for a day, nightly", async () => {
    const limiter = new PostgresRateLimiter(getDb)
    await limiter.take(rule, "old")
    await limiter.take(rule, "new")
    await getDb().execute(sql`update api_rate_limits set updated_at = now() - interval '2 days' where key = 'test:old'`)
    expect(await pruneRateLimits(getDb())).toBe(1)
    expect((await getDb().execute<{ key: string }>(sql`select key from api_rate_limits`)).map((r) => r.key)).toEqual(["test:new"])
    expect(jobs["prune-rate-limits"]).toBeDefined()
    expect(vercel.crons).toContainEqual({ path: "/api/jobs/prune-rate-limits", schedule: "45 6 * * *" })
  })
})
