import type { BetaMessage, BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages/messages"
import type { ClaudeStreamer } from "@/server/assistant/run"

export type Step =
  | { text?: string; tools?: { name: string; input: unknown }[]; stop?: BetaMessage["stop_reason"]; message?: Partial<BetaMessage> }
  | Error
  /** A call that fails after streaming some text, with what it had used by then. */
  | { failAfter: { text: string; error: Error; usage: { input_tokens: number; output_tokens: number }; signal?: AbortController } }

/** A Claude client that answers each call with the next scripted step, and records what it was sent. */
export function fakeClaude(steps: Step[]) {
  const calls: BetaMessageStreamParams[] = []
  const claude: ClaudeStreamer = {
    stream(params) {
      calls.push(structuredClone(params))
      const step = steps.shift() ?? { text: "(no more steps)" }
      const listeners: ((d: string) => void)[] = []
      return {
        on(_event, listener) {
          listeners.push(listener)
          return this
        },
        get currentMessage() {
          if ("failAfter" in step) return { model: "claude-opus-5-5", content: [], usage: { cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...step.failAfter.usage } } as unknown as BetaMessage
          return undefined
        },
        async finalMessage() {
          if (step instanceof Error) throw step
          if ("failAfter" in step) {
            listeners.forEach((l) => l(step.failAfter.text))
            throw step.failAfter.error
          }
          if (step.message) return { id: "msg_raw", type: "message", role: "assistant", stop_sequence: null, ...step.message } as BetaMessage
          if (step.text) for (const piece of step.text.match(/.{1,6}/gs) ?? []) listeners.forEach((l) => l(piece))
          const content = [
            ...(step.text ? [{ type: "text" as const, text: step.text, citations: null }] : []),
            ...(step.tools ?? []).map((t, i) => ({ type: "tool_use" as const, id: `toolu_${calls.length}_${i}`, name: t.name, input: t.input })),
          ]
          return {
            id: `msg_${calls.length}`,
            type: "message",
            role: "assistant",
            model: "claude-opus-5-5",
            content,
            stop_reason: step.stop ?? (step.tools?.length ? "tool_use" : "end_turn"),
            stop_sequence: null,
            usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 50, cache_creation_input_tokens: 10 },
          } as unknown as BetaMessage
        },
      }
    },
  }
  return { claude, calls }
}
