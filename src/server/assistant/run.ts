import "server-only"
import { createHash } from "node:crypto"
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
import { memoryOf } from "@/lib/assistant/memory"
import { costMicros } from "./pricing"
import type { AssistantCard } from "@/lib/types/assistant"
import type { AssistantEvent, AssistantTurn, AssistantUsage } from "@/lib/types/assistant-stream"

/** What the viewer reads when the model refuses, or the input check blocks a question (#253). */
export const REFUSAL_REPLY = "I can't help with that one. Ask me about finding Pokémon cards, card shops or events."

/** Most model calls in one turn: each after the first follows tool results. */
export const MAX_ROUNDS = 6
/** Output cap per model call. Answers are short; this leaves room for thinking. */
export const MAX_TOKENS = 8000
/** A fast output rate, for charging an aborted call by how long it ran (thinking included). */
export const OUTPUT_TOKENS_PER_SECOND = 150

/** What the turn needs from the Claude client: a streamed message. Tests pass a fake. */
export interface ClaudeStreamer {
  stream(
    params: BetaMessageStreamParams,
    options: { signal?: AbortSignal },
  ): {
    on(event: "text", listener: (delta: string) => void): unknown
    finalMessage(): Promise<BetaMessage>
    /** What has arrived so far, usage included: what an aborted call still cost. */
    readonly currentMessage?: BetaMessage
  }
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
  let client: Anthropic | null
  try {
    client = getAnthropic()
  } catch (err) {
    // A misconfiguration (federation with no identity here): the assistant says it's unavailable, and the log says why.
    console.error("[assistant] couldn't set up the Claude client", err)
    return null
  }
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

/**
 * Which instructions answered: a short hash of the system prompt and the
 * tool definitions, stored with each turn so feedback and evals can be
 * compared across prompt changes.
 */
export const PROMPT_VERSION = createHash("sha256").update(SYSTEM_PROMPT).update(JSON.stringify(API_TOOLS)).digest("hex").slice(0, 10)

const STATUS: Record<string, string> = {
  find_places: "Searching locations…",
  area_stats: "Counting…",
  plan_route: "Planning the route…",
  list_events: "Checking events…",
  get_place: "Looking it up…",
}

// Shared with the page, which builds it when the viewer stops a turn.
export { memoryOf } from "@/lib/assistant/memory"

export const emptyUsage = (): AssistantUsage => ({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 0 })

/** Block types that aren't sent back from before a mid-answer fallback (the API's rule). */
const BEFORE_FALLBACK_DROPPED = new Set(["thinking", "redacted_thinking", "tool_use", "server_tool_use"])

/**
 * The part of a message that counts and goes back in the history. After a
 * refusal fallback mid-answer, content before the last `fallback` block is
 * the declined model's partial: its text stays, but its tool calls and
 * thinking are dropped, so they're neither run nor sent back.
 */
export function usableContent(content: BetaMessage["content"]): BetaMessage["content"] {
  const boundary = content.map((b) => b.type as string).lastIndexOf("fallback")
  if (boundary < 0) return content
  return content.filter((b, i) => i > boundary || (!BEFORE_FALLBACK_DROPPED.has(b.type) && (b.type as string) !== "fallback"))
}

/**
 * Each attempt behind a message, with its model and tokens: with a refusal
 * fallback, `usage.iterations` lists the declined attempt too (billed), while
 * the top-level usage covers only the attempt that answered.
 */
export function usageAttempts(m: BetaMessage): { model: string; inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number }[] {
  const its = (m.usage.iterations ?? []).filter((x) => x.type === "message" || x.type === "fallback_message")
  const rows = its.length ? its : [{ ...m.usage, model: m.model }]
  return rows.map((x) => ({
    model: ("model" in x && x.model) || m.model,
    inputTokens: x.input_tokens,
    outputTokens: x.output_tokens,
    cacheReadTokens: x.cache_read_input_tokens ?? 0,
    cacheWriteTokens: x.cache_creation_input_tokens ?? 0,
  }))
}

/** Adds one model call's usage to `sum` (in place): every attempt, each priced by the model that ran it. */
function addUsage(sum: AssistantUsage, m: BetaMessage) {
  for (const a of usageAttempts(m)) {
    sum.inputTokens += a.inputTokens
    sum.outputTokens += a.outputTokens
    sum.cacheReadTokens += a.cacheReadTokens
    sum.cacheWriteTokens += a.cacheWriteTokens
    sum.costMicros += costMicros(a.model, a)
  }
}

export interface TurnOptions {
  claude: ClaudeStreamer
  model: string
  effort: "low" | "medium" | "high" | "xhigh" | "max"
  /** The conversation so far, ending with the viewer's new message. */
  history: readonly AssistantTurn[]
  tools: ToolContext
  emit: (event: AssistantEvent) => void
  signal?: AbortSignal
  /** Filled in as each model call finishes, so a turn that fails partway still counts what it used. */
  usage?: AssistantUsage
  /** Told about each tool call as it finishes (the turn log, the evals' grounding check). */
  onTool?: (call: { name: string; input: unknown; ok: boolean; error?: string; data?: Record<string, unknown> }) => void
}

/**
 * One assistant turn: streams Claude's answer, runs the tools it asks for
 * (at most MAX_ROUNDS model calls), and emits text, status and cards as
 * they come. Ends with a `done` event carrying the memory and the usage.
 * API errors throw; the route turns them into an `error` event.
 */
export async function runAssistantTurn({ claude, model, effort, history, tools, emit, signal, usage = emptyUsage(), onTool }: TurnOptions): Promise<void> {
  const messages: BetaMessageParam[] = [
    ...history.map((t): BetaMessageParam => ({ role: t.role, content: t.content })),
    // Per-request facts as an operator message after the newest user message, so the cached prefix stays put.
    { role: "system", content: turnContext({ now: tools.now, viewerShared: tools.viewer !== null }) },
  ]
  const cards: AssistantCard[] = []
  let text = ""
  let served = model

  const finish = (stop: Extract<AssistantEvent, { type: "done" }>["stop"]) =>
    // The model that answered: a refusal fallback can differ from the one asked for.
    emit({ type: "done", stop, memory: memoryOf(text, cards), usage: { ...usage }, model: served })

  for (let round = 0; round < MAX_ROUNDS; round++) {
    // Where this round's text starts, so a declined round's partial can be dropped from the memory.
    const roundStart = text.length
    const roundStartedAt = Date.now()
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
    let message: BetaMessage
    try {
      message = await stream.finalMessage()
    } catch (err) {
      // An aborted or failed call is still billed for what it got through: count it. The
      // stream reports output tokens only at its end, and thinking isn't visible, so estimate
      // generously: the larger of the text that came (about 3 characters a token) and the
      // time the call ran at a fast generation rate, up to the cap (all of it on a timeout).
      // Stopping while the model thinks is then charged for the thinking too.
      const partial = stream.currentMessage
      if (partial?.usage) {
        const timedOut = signal?.aborted && (signal.reason as Error | undefined)?.name === "TimeoutError"
        const byText = Math.ceil((text.length - roundStart) / 3)
        const byTime = Math.ceil(((Date.now() - roundStartedAt) / 1000) * OUTPUT_TOKENS_PER_SECOND)
        const estimate = timedOut ? MAX_TOKENS : Math.min(MAX_TOKENS, Math.max(byText, byTime))
        addUsage(usage, { ...partial, usage: { ...partial.usage, iterations: null, output_tokens: Math.max(partial.usage.output_tokens, estimate) } })
      }
      throw err
    }
    addUsage(usage, message)
    served = message.model
    const content = usableContent(message.content)

    if (message.stop_reason === "refusal") {
      const sorry = REFUSAL_REPLY
      const piece = (text.trim() ? "\n\n" : "") + sorry
      emit({ type: "text", text: piece })
      // The declined partial was shown as it streamed, but it isn't an answer: it stays out of the memory.
      text = text.slice(0, roundStart).trimEnd()
      text += (text ? "\n\n" : "") + sorry
      return finish("refusal")
    }
    const uses = content.filter((b): b is BetaToolUseBlock => b.type === "tool_use")
    // A tool input cut off at max_tokens can still parse; never run it.
    if (uses.length === 0 || message.stop_reason === "max_tokens") return finish(message.stop_reason === "max_tokens" ? "max_tokens" : "end_turn")

    messages.push({ role: "assistant", content })
    const results = await Promise.all(
      uses.map(async (use): Promise<BetaToolResultBlockParam> => {
        emit({ type: "status", text: STATUS[use.name] ?? "Working…" })
        const r = await runTool(use.name, use.input, tools)
        onTool?.({ name: use.name, input: use.input, ok: r.ok, ...(r.ok ? { data: r.data } : { error: r.error }) })
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
