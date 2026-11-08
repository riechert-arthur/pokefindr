import "server-only"
import Anthropic from "@anthropic-ai/sdk"
import type {
  BetaMessage,
  BetaMessageParam,
  BetaMessageStreamParams,
  BetaTool,
  BetaToolResultBlockParam,
  BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages"
import { getAnthropic } from "@/server/container"
import { ASSISTANT_TOOLS, inputJsonSchema, runTool, type ToolContext } from "./tools"
import { SYSTEM_PROMPT, turnContext } from "./prompt"
import type { AssistantCard } from "@/lib/types/assistant"
import type { AssistantEvent, AssistantTurn, AssistantUsage } from "@/lib/types/assistant-stream"

/** Most model calls in one turn: each after the first follows tool results. */
export const MAX_ROUNDS = 6
/** Output cap per model call. Answers are short; this leaves room for thinking. */
export const MAX_TOKENS = 8000

/** What the turn needs from the Claude client: a streamed message. Tests pass a fake. */
export interface ClaudeStreamer {
  stream(
    params: BetaMessageStreamParams,
    options: { signal?: AbortSignal },
  ): { on(event: "text", listener: (delta: string) => void): unknown; finalMessage(): Promise<BetaMessage> }
}

export const claudeStreamer = (client: Anthropic): ClaudeStreamer => ({
  stream: (params, options) => client.beta.messages.stream(params, options),
})

let streamerForTests: ClaudeStreamer | null = null
/** Test helper: answer with a fake Claude client (null restores the real one). */
export function setClaudeForTests(s: ClaudeStreamer | null) {
  streamerForTests = s
}

/** The Claude client the assistant uses, or null when no key is configured. */
export function getClaude(): ClaudeStreamer | null {
  if (streamerForTests) return streamerForTests
  const client = getAnthropic()
  return client && claudeStreamer(client)
}

/** Most messages of history a turn sends; older ones are dropped. */
export const MAX_TURNS = 20

/** The tools as the API takes them, in a fixed order (they're part of the cached prefix). */
const API_TOOLS: BetaTool[] = ASSISTANT_TOOLS.map((t) => ({
  name: t.name,
  description: t.description,
  input_schema: inputJsonSchema(t),
  // Inputs stream as they're written; runTool validates each one before it runs.
  eager_input_streaming: true,
}))

const STATUS: Record<string, string> = {
  find_places: "Searching locations…",
  area_stats: "Counting…",
  plan_route: "Planning the route…",
  list_events: "Checking events…",
  get_place: "Looking it up…",
}

/**
 * What the next turn remembers of this one: the answer, plus the places it
 * showed (ids included, so "plan a route through those" works). The page
 * sends it back as this turn's assistant message.
 */
export function memoryOf(text: string, cards: readonly AssistantCard[]): string {
  const lines = cards.flatMap((c) => {
    if (c.type === "places") return [`[${c.title}: ${c.places.map((p) => `${p.name}, ${p.city} (id ${p.id})`).join("; ")}]`]
    if (c.type === "route") return [`[Route: ${c.stops.map((p, i) => `${i + 1}. ${p.name} (id ${p.id})`).join("; ")}]`]
    if (c.type === "events") return [`[${c.title}: ${c.events.map((e) => `${e.title}, ${e.city} ${e.startsAt.slice(0, 10)}`).join("; ")}]`]
    return [`[${c.title}: ${c.total} places]`]
  })
  return [text.trim(), ...lines].filter(Boolean).join("\n")
}

const addUsage = (sum: AssistantUsage, m: BetaMessage): AssistantUsage => ({
  inputTokens: sum.inputTokens + m.usage.input_tokens,
  outputTokens: sum.outputTokens + m.usage.output_tokens,
  cacheReadTokens: sum.cacheReadTokens + (m.usage.cache_read_input_tokens ?? 0),
  cacheWriteTokens: sum.cacheWriteTokens + (m.usage.cache_creation_input_tokens ?? 0),
})

export interface TurnOptions {
  claude: ClaudeStreamer
  model: string
  effort: "low" | "medium" | "high" | "xhigh" | "max"
  /** The conversation so far, ending with the viewer's new message. */
  history: readonly AssistantTurn[]
  tools: ToolContext
  emit: (event: AssistantEvent) => void
  signal?: AbortSignal
}

/**
 * One assistant turn: streams Claude's answer, runs the tools it asks for
 * (at most MAX_ROUNDS model calls), and emits text, status and cards as
 * they come. Ends with a `done` event carrying the memory and the usage.
 * API errors throw; the route turns them into an `error` event.
 */
export async function runAssistantTurn({ claude, model, effort, history, tools, emit, signal }: TurnOptions): Promise<void> {
  const messages: BetaMessageParam[] = [
    ...history.map((t): BetaMessageParam => ({ role: t.role, content: t.content })),
    // Per-request facts as an operator message after the newest user message, so the cached prefix stays put.
    { role: "system", content: turnContext({ now: tools.now, viewerShared: tools.viewer !== null }) },
  ]
  const cards: AssistantCard[] = []
  let text = ""
  let usage: AssistantUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 }

  const finish = (stop: Extract<AssistantEvent, { type: "done" }>["stop"]) =>
    emit({ type: "done", stop, memory: memoryOf(text, cards), usage, model })

  for (let round = 0; round < MAX_ROUNDS; round++) {
    const stream = claude.stream(
      {
        model,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: API_TOOLS,
        messages,
        output_config: { effort },
        // Caches the conversation so far too, so each tool round reads it back cheaply.
        cache_control: { type: "ephemeral" },
        // If a safety classifier declines, the API retries on a model it routes to.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal },
    )
    stream.on("text", (delta) => {
      text += delta
      emit({ type: "text", text: delta })
    })
    const message = await stream.finalMessage()
    usage = addUsage(usage, message)

    if (message.stop_reason === "refusal") {
      const sorry = "I can't help with that one. Ask me about finding Pokémon cards, card shops or events."
      const piece = (text.trim() ? "\n\n" : "") + sorry
      text += piece
      emit({ type: "text", text: piece })
      return finish("refusal")
    }
    const uses = message.content.filter((b): b is BetaToolUseBlock => b.type === "tool_use")
    // A tool input cut off at max_tokens can still parse; never run it.
    if (uses.length === 0 || message.stop_reason === "max_tokens") return finish(message.stop_reason === "max_tokens" ? "max_tokens" : "end_turn")

    messages.push({ role: "assistant", content: message.content })
    const results = await Promise.all(
      uses.map(async (use): Promise<BetaToolResultBlockParam> => {
        emit({ type: "status", text: STATUS[use.name] ?? "Working…" })
        const r = await runTool(use.name, use.input, tools)
        if (!r.ok) return { type: "tool_result", tool_use_id: use.id, is_error: true, content: r.error }
        if (r.card) {
          cards.push(r.card)
          emit({ type: "card", card: r.card })
        }
        return { type: "tool_result", tool_use_id: use.id, content: JSON.stringify(r.data) }
      }),
    )
    // All results in one user message, so Claude keeps calling tools in parallel.
    messages.push({ role: "user", content: results })
    if (text && !text.endsWith("\n")) {
      text += "\n\n"
      emit({ type: "text", text: "\n\n" })
    }
  }
  const stopped = "I stopped after several searches. Try a narrower question."
  text += stopped
  emit({ type: "text", text: stopped })
  return finish("tool_limit")
}
