import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import Anthropic from "@anthropic-ai/sdk"
import { getGeocoder } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { getDb } from "@/server/db/client"
import { MAX_TURNS, emptyUsage, getClaude, runAssistantTurn } from "@/server/assistant/run"
import { endTurn, loadPlaceBudget, savePlaceViews, startTurn, warnOnSpend } from "@/server/assistant/limits"
import { flagsFor, recordTurn, type ToolCall } from "@/server/assistant/log"
import type { AssistantOutcome } from "@/server/db/schema"
import type { AssistantEvent } from "@/lib/types/assistant-stream"

export const dynamic = "force-dynamic"
// A turn can take a few tool rounds.
export const maxDuration = 60

const bodySchema = z.object({
  messages: z
    .array(
      z.discriminatedUnion("role", [
        z.object({ role: z.literal("user"), content: z.string().trim().min(1).max(2000) }),
        z.object({ role: z.literal("assistant"), content: z.string().max(4000) }),
      ]),
    )
    .min(1)
    .max(60)
    .refine((m) => m[m.length - 1].role === "user", "the last message must be the viewer's")
    // Older turns are dropped anyway; this bounds what one request can make us parse.
    .refine((m) => m.reduce((n, t) => n + t.content.length, 0) <= 60_000, "the conversation is too long"),
  /** The viewer's location, when they shared it. Rounded here to ~1 km before any tool or model sees it. */
  viewer: z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) }).nullish(),
})

const round2 = (n: number) => Math.round(n * 100) / 100

/** A turn gives up after this long, inside the function's 60 s. */
const TURN_TIMEOUT_MS = 55_000

/** What the viewer sees when the API fails; the details go to the log. */
function failureMessage(err: unknown, timedOut: boolean): string {
  if (err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && err.status === 529)) return "The assistant is busy right now. Try again in a minute."
  if (timedOut || err instanceof Anthropic.APIConnectionTimeoutError) return "The assistant took too long. Try again, or ask something narrower."
  return "Something went wrong with the assistant. Try again."
}

/**
 * POST /api/assistant  { messages, viewer? }
 *   One assistant turn for a signed-in viewer (middleware sets x-user-id),
 *   streamed as NDJSON AssistantEvents: text, status, cards, then done or
 *   error. 503 when no Claude key is configured, the kill switch is off or
 *   today's spend ceiling is reached; 429 (with Retry-After) past the
 *   viewer's limits.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  const config = getServerConfig()
  const claude = getClaude()
  if (!claude || !config.ASSISTANT_ENABLED) return NextResponse.json({ error: "The assistant isn't available right now.", paused: true }, { status: 503 })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "Invalid request", issues: body.error.issues.map((i) => i.message) }, { status: 400 })

  const db = getDb()
  const now = new Date()
  const budgetMicros = Math.round(config.ASSISTANT_DAILY_BUDGET_USD * 1e6)
  let started: Awaited<ReturnType<typeof startTurn>>
  try {
    started = await startTurn({ userId, now, dailyBudgetMicros: budgetMicros }, db)
  } catch (err) {
    console.error("[api/assistant] couldn't check the limits", err)
    return NextResponse.json({ error: "Something went wrong with the assistant. Try again." }, { status: 500 })
  }
  const question = body.data.messages[body.data.messages.length - 1].content
  if (!started.ok) {
    const r = started.refusal
    const outcome: AssistantOutcome = r.kind === "paused" ? "paused" : "limited"
    // Quick in-memory refusals aren't logged, so a script hammering the endpoint can't grow the log.
    if (!("quick" in r && r.quick))
      await recordTurn(
      { id: crypto.randomUUID(), userId, outcome, model: null, usage: emptyUsage(), latencyMs: null, tools: [], flags: flagsFor({ question, outcome, tools: [], costMicros: 0 }), text: null },
      db,
    ).catch((err) => console.error("[api/assistant] couldn't log the turn", err))
    return r.kind === "paused"
      ? NextResponse.json({ error: r.message, paused: true }, { status: 503 })
      : NextResponse.json({ error: r.message }, { status: 429, headers: { "Retry-After": String(r.retryAfter) } })
  }
  warnOnSpend(started.spentToday, budgetMicros, now)
  const { ASSISTANT_MODEL, ASSISTANT_EFFORT } = config
  // A blank answer (one that ran out of output) is skipped, not an error.
  const history = body.data.messages.filter((m) => m.role === "user" || m.content.trim()).slice(-MAX_TURNS)
  // The API wants the first message to be the viewer's.
  while (history[0]?.role === "assistant") history.shift()
  const viewer = body.data.viewer ? { lng: round2(body.data.viewer.lng), lat: round2(body.data.viewer.lat) } : null

  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(TURN_TIMEOUT_MS)])
  const usage = emptyUsage()
  const turnId = crypto.randomUUID()
  const toolCalls: ToolCall[] = []
  let answer = ""
  let outcome: AssistantOutcome = "error"
  let model: string | null = null
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (raw: AssistantEvent) => {
        let event = raw
        if (event.type === "text") answer += event.text
        if (event.type === "done") {
          outcome = ({ end_turn: "answered", refusal: "refused", tool_limit: "tool_limit", max_tokens: "max_tokens" } as const)[event.stop]
          model = event.model
          event = { ...event, turnId }
        }
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        } catch {
          // The viewer left; the request's signal stops the turn.
        }
      }
      const places = await loadPlaceBudget(userId, now, db).catch(() => undefined)
      try {
        await runAssistantTurn({
          claude,
          model: ASSISTANT_MODEL,
          effort: ASSISTANT_EFFORT,
          history,
          tools: { db, geocoder: getGeocoder(), viewer, now, signal, places },
          emit,
          signal,
          usage,
          onTool: (call) => toolCalls.push(call),
        })
      } catch (err) {
        if (request.signal.aborted) outcome = "stopped"
        else {
          console.error("[api/assistant] turn failed", err)
          emit({ type: "error", message: failureMessage(err, signal.aborted) })
        }
      } finally {
        await Promise.all([
          endTurn({ userId, now, usage }, db),
          places ? savePlaceViews(userId, now, places, db) : undefined,
          recordTurn(
            {
              id: turnId,
              userId,
              outcome,
              model: model ?? ASSISTANT_MODEL,
              usage,
              latencyMs: Date.now() - now.getTime(),
              tools: toolCalls,
              flags: flagsFor({ question, outcome, tools: toolCalls, costMicros: usage.costMicros }),
              text: { question, answer },
            },
            db,
          ),
        ]).catch((err) => console.error("[api/assistant] couldn't record usage", err))
        try {
          controller.close()
        } catch {
          // Already closed by a disconnect.
        }
      }
    },
  })
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  })
}
