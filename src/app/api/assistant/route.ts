import { NextResponse, type NextRequest } from "next/server"
import { z } from "zod"
import Anthropic from "@anthropic-ai/sdk"
import { getGeocoder } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { getDb } from "@/server/db/client"
import { MAX_TURNS, getClaude, runAssistantTurn } from "@/server/assistant/run"
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
    .refine((m) => m[m.length - 1].role === "user", "the last message must be the viewer's"),
  /** The viewer's location, when they shared it. Rounded here to ~1 km before any tool or model sees it. */
  viewer: z.object({ lng: z.number().min(-180).max(180), lat: z.number().min(-90).max(90) }).nullish(),
})

const round2 = (n: number) => Math.round(n * 100) / 100

/** What the viewer sees when the API fails; the details go to the log. */
function failureMessage(err: unknown): string {
  if (err instanceof Anthropic.RateLimitError || (err instanceof Anthropic.APIError && err.status === 529)) return "The assistant is busy right now. Try again in a minute."
  if (err instanceof Anthropic.APIConnectionTimeoutError) return "The assistant took too long. Try again, or ask something narrower."
  return "Something went wrong with the assistant. Try again."
}

/**
 * POST /api/assistant  { messages, viewer? }
 *   One assistant turn for a signed-in viewer (middleware sets x-user-id),
 *   streamed as NDJSON AssistantEvents: text, status, cards, then done or
 *   error. 503 when no Claude key is configured.
 */
export async function POST(request: NextRequest) {
  const userId = request.headers.get("x-user-id")
  if (!userId) return NextResponse.json({ error: "Log in to continue" }, { status: 401 })
  const claude = getClaude()
  if (!claude) return NextResponse.json({ error: "The assistant isn't available right now." }, { status: 503 })
  const body = bodySchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return NextResponse.json({ error: "Invalid request", issues: body.error.issues.map((i) => i.message) }, { status: 400 })

  const { ASSISTANT_MODEL, ASSISTANT_EFFORT } = getServerConfig()
  const history = body.data.messages.slice(-MAX_TURNS)
  // The API wants the first message to be the viewer's.
  while (history[0]?.role === "assistant") history.shift()
  const viewer = body.data.viewer ? { lng: round2(body.data.viewer.lng), lat: round2(body.data.viewer.lat) } : null

  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AssistantEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"))
        } catch {
          // The viewer left; the request's signal stops the turn.
        }
      }
      try {
        await runAssistantTurn({
          claude,
          model: ASSISTANT_MODEL,
          effort: ASSISTANT_EFFORT,
          history,
          tools: { db: getDb(), geocoder: getGeocoder(), viewer, now: new Date(), signal: request.signal },
          emit,
          signal: request.signal,
        })
      } catch (err) {
        if (!request.signal.aborted) {
          console.error("[api/assistant] turn failed", err)
          emit({ type: "error", message: failureMessage(err) })
        }
      } finally {
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
