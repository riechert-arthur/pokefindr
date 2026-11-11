// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { DrizzleQueryError } from "drizzle-orm/errors"
import postgres from "postgres"
import { audit, describeError, log, MAX_LINES_PER_REQUEST, redact, sampled, timed } from "@/server/log"

vi.mock("server-only", () => ({}))

let info: ReturnType<typeof vi.spyOn>
let error: ReturnType<typeof vi.spyOn>
let warn: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => {})
  error = vi.spyOn(console, "error").mockImplementation(() => {})
  warn = vi.spyOn(console, "warn").mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

const lines = (spy: ReturnType<typeof vi.spyOn>) => spy.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>)
const all = () => [...info.mock.calls, ...error.mock.calls].map((c) => String(c[0])).join("\n")

/** A unique-key failure on a review insert, as postgres-js and Drizzle report it. */
function failedInsert() {
  const cause = new postgres.PostgresError({
    message: 'duplicate key value violates unique constraint "location_ratings_pkey"',
    code: "23505",
    constraint_name: "location_ratings_pkey",
    table_name: "location_ratings",
    detail: "Key (id)=(7d0c…) already exists.",
  } as unknown as string)
  return new DrizzleQueryError(
    'insert into "location_ratings" ("id", "location_id", "user_id", "rating", "text") values ($1, $2, $3, $4, $5)',
    ["7d0c6a8e-0000-4000-8000-000000000001", "loc-1", "user-1", 5, "My address is 12 Elm St, ash@example.com"],
    cause,
  )
}

describe("log", () => {
  it("writes one JSON object per line: info to console.info, warn and error to console.error", () => {
    log.info("a.info", { n: 1 })
    log.warn("a.warn")
    log.error("a.error")
    expect(lines(info)).toEqual([{ level: "info", event: "a.info", n: 1 }])
    expect(lines(error)).toEqual([
      { level: "warn", event: "a.warn" },
      { level: "error", event: "a.error" },
    ])
    expect(warn).not.toHaveBeenCalled()
  })

  it("drops emails, tokens, passwords, coordinates and typed text, at any depth", () => {
    log.info("x", {
      email: "ash@example.com",
      userEmail: "ash@example.com",
      token: "t",
      accessToken: "t",
      password: "p",
      cookie: "c",
      authorization: "Bearer x",
      lat: 47.6,
      lng: -122.3,
      query: "select 1",
      text: "hello",
      comment: "hi",
      nested: { center: [1, 2], secret: "s", ok: true },
      userId: "u1",
      inputTokens: 12,
    })
    expect(lines(info)[0]).toEqual({ level: "info", event: "x", nested: { ok: true }, userId: "u1", inputTokens: 12 })
    expect(all()).not.toMatch(/example\.com|47\.6|Bearer|hello/)
  })

  it("cuts long strings so a line stays small", () => {
    log.info("x", { note: "a".repeat(50_000) })
    expect(String(info.mock.calls[0][0]).length).toBeLessThan(2_000)
    expect(redact({ list: Array(500).fill(1) })).toEqual({ list: Array(50).fill(1) })
  })

  it("reads the request id from x-vercel-id, with the route", () => {
    const request = new Request("https://pokefindr.test/api/x", { headers: { "x-vercel-id": "iad1::abc-123" } })
    log.forRequest(request, "/api/x").info("y")
    expect(lines(info)[0]).toEqual({ level: "info", event: "y", requestId: "iad1::abc-123", route: "/api/x" })
  })

  it("stops after MAX_LINES_PER_REQUEST lines for one request, however many loggers it makes, saying so", () => {
    const request = new Request("https://pokefindr.test/")
    for (let i = 0; i < MAX_LINES_PER_REQUEST + 20; i++) log.forRequest(request, "/api/x").with({ i }).info("spam")
    expect(info).toHaveBeenCalledTimes(MAX_LINES_PER_REQUEST)
    expect(lines(error)).toEqual([expect.objectContaining({ event: "log.capped" })])
    // Another request has its own budget.
    log.forRequest(new Request("https://pokefindr.test/")).info("other")
    expect(info).toHaveBeenCalledTimes(MAX_LINES_PER_REQUEST + 1)
  })

  it("keeps the line's own level and event, and the caller's fields over the error's", () => {
    log.info("x", { level: "debug", event: "y" })
    expect(lines(info)[0]).toMatchObject({ level: "info", event: "x" })
    log.logError("z", Object.assign(new Error("boom"), { code: "ECONNRESET" }), { code: "MY_CODE" })
    expect(lines(error)[0]).toMatchObject({ code: "MY_CODE", msg: "boom" })
    expect(Object.values(describeError(new Error("plain")))).not.toContain(undefined)
  })
})

describe("logError", () => {
  it("writes a real DrizzleQueryError's code and constraint, never its params or query", () => {
    const err = failedInsert()
    expect(err.message).toContain("params:") // what logging it raw would leak
    log.forRequest(new Request("https://pokefindr.test/", { headers: { "x-vercel-id": "r1" } }), "/api/reviews").logError("db.write_failed", err, { write: "review" })
    const [line] = lines(error)
    expect(line).toMatchObject({
      level: "error",
      event: "db.write_failed",
      requestId: "r1",
      route: "/api/reviews",
      write: "review",
      errorName: "DrizzleQueryError",
      code: "23505",
      constraint: "location_ratings_pkey",
      table: "location_ratings",
      msg: 'duplicate key value violates unique constraint "…"',
    })
    const out = all()
    expect(out).not.toContain("params:")
    expect(out).not.toMatch(/insert into|values \(|Elm St|example\.com|user-1|7d0c/)
  })

  it("keeps only the first line of a message, without quoted values, addresses or URL queries", () => {
    expect(describeError(new Error('invalid input syntax for type uuid: "ash@example.com"\nmore'))).toMatchObject({ msg: 'invalid input syntax for type uuid: "…"' })
    expect(describeError(new Error("Can't send mail - all recipients were rejected: 550 <ash@example.com>"))).toMatchObject({ msg: "Can't send mail - all recipients were rejected: 550 <[email]>" })
    expect(describeError(new Error("fetch https://geo.test/search?q=12+Elm+St failed"))).toMatchObject({ msg: "fetch https://geo.test/search?… failed" })
    // Values quoted without a colon before them.
    expect(describeError(new Error('value "99999999999" is out of range for type integer'))).toMatchObject({ msg: 'value "…" is out of range for type integer' })
    expect(describeError(new Error('Unexpected token \'a\', "ash@example.com" is not valid JSON'))).toMatchObject({ msg: 'Unexpected token \'a\', "…" is not valid JSON' })
  })

  it("logs a failed query wrapped in another error by its driver's code, never its SQL", () => {
    log.logError("auth.error", new Error("Failed to create user", { cause: failedInsert() }))
    expect(lines(error)[0]).toMatchObject({ errorName: "Error", msg: "Failed to create user", cause: { errorName: "DrizzleQueryError", code: "23505" } })
    expect(all()).not.toMatch(/Failed query|insert into|example\.com|user-1/)
  })

  it("writes an SMTP error's code and response code", () => {
    const err = Object.assign(new Error("Message failed: 550 5.1.1 <ash@example.com>: Recipient address rejected"), { code: "EENVELOPE", responseCode: 550 })
    log.logError("auth.email_failed", err, { template: "verifyEmail" })
    expect(lines(error)[0]).toMatchObject({ code: "EENVELOPE", responseCode: 550, template: "verifyEmail" })
    expect(all()).not.toContain("ash@example.com")
  })

  it("handles what isn't an Error", () => {
    expect(describeError("boom")).toMatchObject({ errorName: "string", msg: "boom" })
    expect(describeError({ password: "x" })).toEqual({ errorName: "object", msg: undefined })
  })

  it("can log at warn", () => {
    log.logError("job.record_failed", new Error("x"), {}, "warn")
    expect(lines(error)[0]).toMatchObject({ level: "warn", event: "job.record_failed" })
  })
})

describe("timed", () => {
  it("logs db.slow with the operation and time, past the threshold only", async () => {
    vi.useFakeTimers()
    try {
      const slow = timed("queryFeatures", () => new Promise((r) => setTimeout(() => r("done"), 600)))
      await vi.advanceTimersByTimeAsync(600)
      expect(await slow).toBe("done")
      expect(await timed("fast", async () => 1)).toBe(1)
    } finally {
      vi.useRealTimers()
    }
    const [line, ...rest] = lines(error)
    expect(line).toMatchObject({ level: "warn", event: "db.slow", op: "queryFeatures" })
    expect(line.ms).toBeGreaterThanOrEqual(500)
    expect(rest).toEqual([])
  })

  it("rethrows a failure, still timing it", async () => {
    await expect(timed("x", async () => Promise.reject(new Error("no")), { thresholdMs: -1 })).rejects.toThrow("no")
    expect(lines(error)[0]).toMatchObject({ event: "db.slow", op: "x" })
  })
})

describe("audit and sampling", () => {
  it("writes an admin line with the actor's id", () => {
    audit(log, "job.pause", { actorId: "admin-1", target: "send-digest", outcome: "done" })
    expect(lines(info)[0]).toEqual({ level: "info", event: "admin.job.pause", action: "job.pause", actorId: "admin-1", target: "send-digest", outcome: "done" })
  })

  it("samples one in `every`", () => {
    expect(sampled(1, () => 0.99)).toBe(true)
    expect(sampled(10, () => 0.05)).toBe(true)
    expect(sampled(10, () => 0.5)).toBe(false)
  })
})
