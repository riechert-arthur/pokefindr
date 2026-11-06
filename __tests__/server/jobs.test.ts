// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import type { MessageMetadata } from "@vercel/queue"
import { z } from "zod"

vi.mock("server-only", () => ({}))
const send = vi.fn()
vi.mock("@vercel/queue", () => ({
  send: (...args: unknown[]) => send(...args),
  handleCallback: (handler: unknown) => handler,
}))

import { resetServerConfigForTests } from "@/server/config"
import { isAuthorizedJobRequest } from "@/server/lib/jobs/auth"
import { runJob, UnknownJobError, InvalidJobPayloadError } from "@/server/lib/jobs/run"
import { enqueueJob, JOBS_TOPIC, type JobMessage } from "@/server/lib/jobs/enqueue"
import { handleJobMessage, retryJobMessage, MAX_DELIVERIES, FIRST_RETRY_SECONDS } from "@/server/lib/jobs/consumer"
import { signJobMessage, verifyJobMessage } from "@/server/lib/jobs/signing"
import { jobs } from "@/server/lib/jobs/registry"
import { defineJob } from "@/server/lib/jobs/types"
import { GET, POST } from "@/app/api/jobs/[name]/route"
import type { NextRequest } from "next/server"
import vercelJson from "../../vercel.json"

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

/** A message exactly as enqueueJob() would send it. */
const signed = (job: string, payload: unknown, secret = SECRET): JobMessage => {
  const body = JSON.stringify(payload)
  return { v: 1, job, body, sig: signJobMessage(job, body, secret) }
}

const request = (method: string, init: { auth?: string; body?: string; userAgent?: string } = {}) => {
  const headers: Record<string, string> = {}
  if (init.auth) headers.authorization = init.auth
  if (init.userAgent) headers["user-agent"] = init.userAgent
  return new Request("https://pokefindr.example/api/jobs/noop", { method, headers, body: init.body }) as unknown as NextRequest
}
const params = (name: string) => ({ params: Promise.resolve({ name }) })
const auth = `Bearer ${SECRET}`

/** A job with a payload schema, registered only for these tests. */
const typed = defineJob({
  description: "test job with a schema",
  schema: z.object({ id: z.string() }),
  async run(payload) {
    return { id: payload.id }
  },
})

beforeEach(() => {
  resetServerConfigForTests()
  for (const [key, value] of Object.entries(baseEnv)) vi.stubEnv(key, value)
  vi.spyOn(console, "info").mockImplementation(() => {})
  vi.spyOn(console, "warn").mockImplementation(() => {})
  vi.spyOn(console, "error").mockImplementation(() => {})
  send.mockReset()
  jobs.typed = typed
})

afterEach(() => {
  delete jobs.typed
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  resetServerConfigForTests()
})

describe("isAuthorizedJobRequest", () => {
  it("accepts the exact bearer secret", () => {
    expect(isAuthorizedJobRequest(auth, SECRET)).toBe(true)
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

describe("message signing", () => {
  it("verifies its own signatures", () => {
    const sig = signJobMessage("noop", '{"a":1}', SECRET)
    expect(verifyJobMessage("noop", '{"a":1}', sig, SECRET)).toBe(true)
  })

  it.each([
    ["another job", "other", '{"a":1}'],
    ["another body", "noop", '{"a":2}'],
  ])("rejects a signature reused for %s", (_label, job, body) => {
    const sig = signJobMessage("noop", '{"a":1}', SECRET)
    expect(verifyJobMessage(job, body, sig, SECRET)).toBe(false)
  })

  it("rejects a signature made with another secret, or garbage", () => {
    const sig = signJobMessage("noop", "null", "o".repeat(40))
    expect(verifyJobMessage("noop", "null", sig, SECRET)).toBe(false)
    expect(verifyJobMessage("noop", "null", "nope", SECRET)).toBe(false)
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

  it("validates the payload with the job's schema", async () => {
    await expect(runJob("typed", { id: "a" }, { trigger: "cli" })).resolves.toEqual({ id: "a" })
    await expect(runJob("typed", [], { trigger: "cli" })).rejects.toBeInstanceOf(InvalidJobPayloadError)
    await expect(runJob("typed", null, { trigger: "cli" })).rejects.toThrow(/Invalid payload for job typed/)
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
    expect((await GET(request("GET", { auth: "Bearer wrong" }), params("noop"))).status).toBe(401)
  })

  it("rejects everything when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "")
    resetServerConfigForTests()
    expect((await GET(request("GET", { auth: "Bearer " }), params("noop"))).status).toBe(401)
  })

  it("returns 404 for an unknown job", async () => {
    expect((await GET(request("GET", { auth }), params("nope"))).status).toBe(404)
  })

  it("labels Vercel Cron GETs as cron and other GETs as http", async () => {
    const cron = await GET(request("GET", { auth, userAgent: "vercel-cron/1.0" }), params("noop"))
    expect(await cron.json()).toEqual({ job: "noop", ok: true, result: { trigger: "cron", payload: null } })
    const manual = await GET(request("GET", { auth, userAgent: "curl/8" }), params("noop"))
    expect(await manual.json()).toMatchObject({ result: { trigger: "http" } })
  })

  it("passes a JSON body as the payload on POST, labelled http", async () => {
    const res = await POST(request("POST", { auth, body: '{"id":"abc"}' }), params("noop"))
    expect(await res.json()).toMatchObject({ ok: true, result: { trigger: "http", payload: { id: "abc" } } })
  })

  it("rejects a non-JSON body", async () => {
    expect((await POST(request("POST", { auth, body: "not json" }), params("noop"))).status).toBe(400)
  })

  it("returns 400 when the payload fails the job's schema", async () => {
    const res = await POST(request("POST", { auth, body: "[]" }), params("typed"))
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: "Invalid payload" })
  })

  it("returns 500 without details when the job fails", async () => {
    vi.spyOn(jobs.noop, "run").mockRejectedValueOnce(new Error("secret internals"))
    const res = await GET(request("GET", { auth }), params("noop"))
    expect(res.status).toBe(500)
    expect(JSON.stringify(await res.json())).not.toContain("secret internals")
  })
})

describe("enqueueJob", () => {
  it("off Vercel, returns at once and runs the job in the background", async () => {
    const run = vi.spyOn(jobs.noop, "run")
    const result = await enqueueJob("noop", { id: 1 })
    expect(result.mode).toBe("inline")
    expect(send).not.toHaveBeenCalled()
    if (result.mode === "inline") await result.done
    expect(run).toHaveBeenCalledWith({ id: 1 }, { trigger: "inline" })
  })

  it("off Vercel, never throws to the caller when the job fails", async () => {
    vi.spyOn(jobs.noop, "run").mockRejectedValueOnce(new Error("boom"))
    const result = await enqueueJob("noop")
    if (result.mode === "inline") await expect(result.done).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith("[jobs] failed", expect.anything(), expect.any(Error))
  })

  it("off Vercel, honors delaySeconds", async () => {
    vi.useFakeTimers()
    try {
      const run = vi.spyOn(jobs.noop, "run")
      const result = await enqueueJob("noop", null, { delaySeconds: 30 })
      await vi.advanceTimersByTimeAsync(29_000)
      expect(run).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(1_000)
      if (result.mode === "inline") await result.done
      expect(run).toHaveBeenCalled()
    } finally {
      vi.useRealTimers()
    }
  })

  it("on Vercel, publishes a signed message to the jobs topic", async () => {
    vi.stubEnv("VERCEL", "1")
    resetServerConfigForTests()
    send.mockResolvedValueOnce({ messageId: "msg_9" })
    await expect(enqueueJob("noop", { id: 1 }, { idempotencyKey: "k", delaySeconds: 5 })).resolves.toEqual({ mode: "queued", messageId: "msg_9" })
    expect(send).toHaveBeenCalledWith(JOBS_TOPIC, signed("noop", { id: 1 }), { idempotencyKey: "k", delaySeconds: 5 })
  })

  it("on Vercel, refuses to send without CRON_SECRET", async () => {
    vi.stubEnv("VERCEL", "1")
    vi.stubEnv("CRON_SECRET", "")
    resetServerConfigForTests()
    await expect(enqueueJob("noop")).rejects.toThrow(/CRON_SECRET/)
    expect(send).not.toHaveBeenCalled()
  })

  it("refuses an unknown job before sending", async () => {
    vi.stubEnv("VERCEL", "1")
    resetServerConfigForTests()
    await expect(enqueueJob("nope")).rejects.toBeInstanceOf(UnknownJobError)
    expect(send).not.toHaveBeenCalled()
  })
})

describe("queue consumer", () => {
  it("runs a correctly signed message", async () => {
    const run = vi.spyOn(jobs.noop, "run")
    await handleJobMessage(signed("noop", { id: 2 }), meta(1))
    expect(run).toHaveBeenCalledWith({ id: 2 }, { trigger: "queue", messageId: "msg_1", deliveryCount: 1 })
  })

  it.each([
    ["a malformed message", "garbage"],
    ["the old unsigned shape", { job: "noop", payload: null }],
    ["a forged signature", { ...signed("noop", null), sig: "forged" }],
    ["a payload swapped after signing", { ...signed("noop", { id: 1 }), body: '{"id":666}' }],
    ["a message signed with another secret", signed("noop", null, "o".repeat(40))],
  ])("drops %s without running anything", async (_label, message) => {
    const run = vi.spyOn(jobs.noop, "run")
    await expect(handleJobMessage(message, meta(1))).resolves.toBeUndefined()
    expect(run).not.toHaveBeenCalled()
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/^\[jobs\] dropping/), expect.anything())
  })

  it("drops every message when CRON_SECRET is unset", async () => {
    vi.stubEnv("CRON_SECRET", "")
    resetServerConfigForTests()
    const run = vi.spyOn(jobs.noop, "run")
    await handleJobMessage(signed("noop", null), meta(1))
    expect(run).not.toHaveBeenCalled()
  })

  it("drops a signed message whose payload fails the job's schema", async () => {
    await expect(handleJobMessage(signed("typed", []), meta(1))).resolves.toBeUndefined()
    expect(console.error).toHaveBeenCalledWith("[jobs] dropping queue message with an invalid payload", expect.anything())
  })

  it("retries a signed message for a job this deployment doesn't know", async () => {
    await expect(handleJobMessage(signed("added-later", null), meta(1))).rejects.toBeInstanceOf(UnknownJobError)
  })

  it("throws when the job fails, so the queue retries", async () => {
    vi.spyOn(jobs.noop, "run").mockRejectedValueOnce(new Error("boom"))
    await expect(handleJobMessage(signed("noop", null), meta(1))).rejects.toThrow("boom")
  })

  it("backs off exponentially, capped at 10 minutes", () => {
    expect(retryJobMessage(new Error(), meta(1))).toEqual({ afterSeconds: 10 })
    expect(retryJobMessage(new Error(), meta(3))).toEqual({ afterSeconds: 40 })
    expect(retryJobMessage(new Error(), meta(7))).toEqual({ afterSeconds: 600 })
  })

  it("gives up after MAX_DELIVERIES", () => {
    expect(retryJobMessage(new Error(), meta(MAX_DELIVERIES))).toEqual({ acknowledge: true })
  })

  it("matches the retry settings Vercel uses when the function crashes (vercel.json)", () => {
    const [trigger] = vercelJson.functions["src/app/api/queues/jobs/route.ts"].experimentalTriggers
    expect(trigger).toMatchObject({ topic: JOBS_TOPIC, maxDeliveries: MAX_DELIVERIES, retryAfterSeconds: FIRST_RETRY_SECONDS })
  })
})
