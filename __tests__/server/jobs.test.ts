// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { MessageMetadata } from "@vercel/queue"

vi.mock("server-only", () => ({}))
const send = vi.fn()
vi.mock("@vercel/queue", () => ({
  send: (...args: unknown[]) => send(...args),
  handleCallback: (handler: unknown) => handler,
}))

import { resetServerConfigForTests } from "@/server/config"
import { isAuthorizedJobRequest } from "@/server/jobs/auth"
import { runJob, UnknownJobError } from "@/server/jobs/run"
import { enqueueJob, JOBS_TOPIC } from "@/server/jobs/enqueue"
import { handleJobMessage, retryJobMessage, MAX_DELIVERIES } from "@/server/jobs/consumer"
import { jobs } from "@/server/jobs/registry"
import { GET, POST } from "@/app/api/jobs/[name]/route"
import type { NextRequest } from "next/server"

const SECRET = "s".repeat(40)
const baseEnv = {
  APP_URL: "https://pokefindr.example",
  JWT_SECRET: "secret",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  CRON_SECRET: SECRET,
  VERCEL: "",
}

const meta = (deliveryCount: number): MessageMetadata => ({
  messageId: "msg_1",
  deliveryCount,
  createdAt: new Date(),
  expiresAt: new Date(),
  topicName: JOBS_TOPIC,
  consumerGroup: "default",
  region: "iad1",
})

const request = (method: string, auth?: string, body?: string) =>
  new Request("https://pokefindr.example/api/jobs/noop", {
    method,
    headers: auth ? { authorization: auth } : {},
    body,
  }) as unknown as NextRequest
const params = (name: string) => ({ params: Promise.resolve({ name }) })

beforeEach(() => {
  resetServerConfigForTests()
  for (const [key, value] of Object.entries(baseEnv)) vi.stubEnv(key, value)
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  send.mockReset()
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  resetServerConfigForTests()
})

describe("isAuthorizedJobRequest", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedJobRequest(`Bearer ${SECRET}`, SECRET)).toBe(true)
  })

  it.each([
    ["a wrong secret", `Bearer ${"x".repeat(40)}`],
    ["a different length", "Bearer short"],
    ["no Bearer prefix", SECRET],
    ["a missing header", null],
  ])("rejects %s", (_label, header) => {
    expect(isAuthorizedJobRequest(header, SECRET)).toBe(false)
  })

  it("rejects everything when no secret is configured", () => {
    expect(isAuthorizedJobRequest("Bearer ", undefined)).toBe(false)
    expect(isAuthorizedJobRequest("Bearer anything", "")).toBe(false)
  })
})

describe("runJob", () => {
  it("runs a registered job and logs it", async () => {
    await expect(runJob("noop", { a: 1 }, { trigger: "cli" })).resolves.toEqual({ trigger: "cli", payload: { a: 1 } })
    expect(console.info).toHaveBeenCalledWith("[jobs] ok", expect.objectContaining({ job: "noop", trigger: "cli" }))
  })

  it("throws for an unknown job", async () => {
    await expect(runJob("nope", null, { trigger: "cli" })).rejects.toBeInstanceOf(UnknownJobError)
  })

  it("logs and rethrows a failing job", async () => {
    vi.spyOn(jobs.noop, "run").mockRejectedValueOnce(new Error("boom"))
    await expect(runJob("noop", null, { trigger: "cron" })).rejects.toThrow("boom")
    expect(console.error).toHaveBeenCalledWith("[jobs] failed", expect.objectContaining({ job: "noop" }), expect.any(Error))
  })
})

describe("/api/jobs/[name]", () => {
  it("rejects requests without the secret", async () => {
    expect((await GET(request("GET"), params("noop"))).status).toBe(401)
    expect((await GET(request("GET", "Bearer wrong"), params("noop"))).status).toBe(401)
  })

  it("rejects everything when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "")
    resetServerConfigForTests()
    expect((await GET(request("GET", "Bearer "), params("noop"))).status).toBe(401)
  })

  it("returns 404 for an unknown job", async () => {
    expect((await GET(request("GET", `Bearer ${SECRET}`), params("nope"))).status).toBe(404)
  })

  it("runs the job on GET (Vercel Cron)", async () => {
    const res = await GET(request("GET", `Bearer ${SECRET}`), params("noop"))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ job: "noop", ok: true, result: { trigger: "cron", payload: null } })
  })

  it("passes a JSON body as the payload on POST", async () => {
    const res = await POST(request("POST", `Bearer ${SECRET}`, '{"id":"abc"}'), params("noop"))
    expect(await res.json()).toMatchObject({ ok: true, result: { payload: { id: "abc" } } })
  })

  it("rejects a non-JSON body", async () => {
    expect((await POST(request("POST", `Bearer ${SECRET}`, "not json"), params("noop"))).status).toBe(400)
  })

  it("returns 500 without details when the job fails", async () => {
    vi.spyOn(jobs.noop, "run").mockRejectedValueOnce(new Error("secret internals"))
    const res = await GET(request("GET", `Bearer ${SECRET}`), params("noop"))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("secret internals")
  })
})

describe("enqueueJob", () => {
  it("runs the job inline when not on Vercel", async () => {
    await expect(enqueueJob("noop", { id: 1 })).resolves.toEqual({ mode: "inline", result: { trigger: "inline", payload: { id: 1 } } })
    expect(send).not.toHaveBeenCalled()
  })

  it("publishes to the jobs topic on Vercel", async () => {
    vi.stubEnv("VERCEL", "1")
    resetServerConfigForTests()
    send.mockResolvedValueOnce({ messageId: "msg_9" })
    await expect(enqueueJob("noop", { id: 1 }, { idempotencyKey: "k", delaySeconds: 5 })).resolves.toEqual({ mode: "queued", messageId: "msg_9" })
    expect(send).toHaveBeenCalledWith(JOBS_TOPIC, { job: "noop", payload: { id: 1 } }, { idempotencyKey: "k", delaySeconds: 5 })
  })

  it("refuses an unknown job before sending", async () => {
    vi.stubEnv("VERCEL", "1")
    resetServerConfigForTests()
    // @ts-expect-error: unknown job name on purpose
    await expect(enqueueJob("nope")).rejects.toThrow(/Unknown job/)
    expect(send).not.toHaveBeenCalled()
  })
})

describe("queue consumer", () => {
  it("runs the job named in the message", async () => {
    const run = vi.spyOn(jobs.noop, "run")
    await handleJobMessage({ job: "noop", payload: { id: 2 } }, meta(1))
    expect(run).toHaveBeenCalledWith({ id: 2 }, { trigger: "queue", messageId: "msg_1", deliveryCount: 1 })
  })

  it.each([
    ["a malformed message", "garbage"],
    ["an unknown job", { job: "nope", payload: null }],
  ])("acknowledges %s instead of retrying it", async (_label, message) => {
    await expect(handleJobMessage(message, meta(1))).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith("[jobs] dropping invalid queue message", expect.anything())
  })

  it("throws when the job fails, so the queue retries", async () => {
    vi.spyOn(jobs.noop, "run").mockRejectedValueOnce(new Error("boom"))
    await expect(handleJobMessage({ job: "noop", payload: null }, meta(1))).rejects.toThrow("boom")
  })

  it("backs off exponentially, capped at 10 minutes", () => {
    expect(retryJobMessage(new Error(), meta(1))).toEqual({ afterSeconds: 10 })
    expect(retryJobMessage(new Error(), meta(3))).toEqual({ afterSeconds: 40 })
    expect(retryJobMessage(new Error(), meta(7))).toEqual({ afterSeconds: 600 })
  })

  it("gives up after MAX_DELIVERIES", () => {
    expect(retryJobMessage(new Error(), meta(MAX_DELIVERIES))).toEqual({ acknowledge: true })
  })
})
