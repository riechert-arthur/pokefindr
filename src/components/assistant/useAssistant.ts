"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import type { AssistantCard } from "@/lib/types/assistant"
import type { AssistantEvent, AssistantTurn } from "@/lib/types/assistant-stream"
import { clipHistory, memoryOf } from "@/lib/assistant/memory"
import { track } from "@/lib/analytics"
import { useApiError, type ApiErrorBody } from "@/i18n/useApiError"

export type ChatMessage =
  | { id: number; role: "user"; text: string }
  | {
      id: number
      role: "assistant"
      text: string
      cards: AssistantCard[]
      /** What it's doing while no text has come yet ("Searching locations…"). */
      status: string | null
      /** Shown under the answer when the turn failed or stopped short. */
      note: string | null
      /** What the next turn remembers of this one (the server's summary with place ids). */
      memory: string | null
      /** The turn's id in the server's log, for feedback. */
      turnId: string | null
      done: boolean
    }

/** What a turn that ended without `done` remembers: what came, cards included, so follow-ups can still use its places. */
const partialMemory = (m: { text: string; cards: AssistantCard[] }) => (m.text || m.cards.length ? memoryOf(m.text, m.cards) : null)

/** The conversation as the API takes it: the viewer's words and each answer's memory, the last turns only. */
function historyOf(messages: readonly ChatMessage[]): AssistantTurn[] {
  return clipHistory(
    messages.flatMap((m): AssistantTurn[] => {
      if (m.role === "user") return [{ role: "user", content: m.text }]
      const content = (m.memory ?? m.text).trim()
      return content ? [{ role: "assistant", content }] : []
    }),
  )
}

/** Reads an NDJSON body line by line. */
async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  for (;;) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done })
    let nl: number
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line) yield line
    }
    if (done) break
  }
  if (buffer.trim()) yield buffer.trim()
}

type ChatMessages = ReturnType<typeof useTranslations<"assistant.chat">>

/** What to say when /api/assistant answers with an error status, in the page's language (#185). */
async function refusalNote(res: Response, t: ChatMessages, apiError: ReturnType<typeof useApiError>): Promise<string> {
  if (res.status === 401) return t("sessionEnded")
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null
  return apiError(body, t("failed"))
}

/**
 * The assistant conversation on the page: sends each message with the
 * history to /api/assistant and fills in the answer as its events stream
 * (text, a status while tools run, cards). `stop` aborts the answer and
 * keeps what came; `reset` starts a new chat.
 */
export function useAssistant() {
  const t = useTranslations("assistant.chat")
  const apiError = useApiError()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  const nextId = useRef(1)
  const messagesRef = useRef(messages)
  messagesRef.current = messages

  useEffect(() => () => ctl.current?.abort(), [])

  const send = useCallback(async (text: string, viewer: { lng: number; lat: number } | null) => {
    if (ctl.current) return
    const user: ChatMessage = { id: nextId.current++, role: "user", text }
    const answerId = nextId.current++
    const history = historyOf([...messagesRef.current, user])
    const update = (fn: (m: Extract<ChatMessage, { role: "assistant" }>) => Partial<Extract<ChatMessage, { role: "assistant" }>>) =>
      setMessages((ms) => ms.map((m) => (m.id === answerId && m.role === "assistant" ? { ...m, ...fn(m) } : m)))
    setMessages((ms) => [...ms, user, { id: answerId, role: "assistant", text: "", cards: [], status: t("thinking"), note: null, memory: null, turnId: null, done: false }])
    // Counted over the whole conversation: `history` is clipped to the last turns.
    track("assistant_query", { turn: messagesRef.current.filter((m) => m.role === "user").length + 1 })
    const abort = new AbortController()
    ctl.current = abort
    setBusy(true)
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history, viewer }),
        signal: abort.signal,
      })
      if (!res.ok || !res.body) {
        const note = await refusalNote(res, t, apiError)
        update(() => ({ status: null, note, done: true }))
        return
      }
      for await (const line of lines(res.body)) {
        let event: AssistantEvent
        try {
          event = JSON.parse(line) as AssistantEvent
        } catch {
          continue
        }
        if (event.type === "text") update((m) => ({ text: m.text + event.text, status: null }))
        else if (event.type === "status") update(() => ({ status: event.text }))
        else if (event.type === "card") update((m) => ({ cards: [...m.cards, event.card] }))
        else if (event.type === "error") update((m) => ({ status: null, note: apiError({ code: event.code, error: event.message }), done: true, memory: partialMemory(m) }))
        else if (event.type === "done")
          update(() => ({
            status: null,
            memory: event.memory,
            turnId: event.turnId ?? null,
            done: true,
            note: event.stop === "max_tokens" ? t("cutShort") : null,
          }))
      }
      update((m) => (m.done ? {} : { status: null, done: true, note: m.note ?? t("stoppedEarly"), memory: partialMemory(m) }))
    } catch (err) {
      // Stop after the answer finished changes nothing.
      if (abort.signal.aborted) update((m) => (m.done ? {} : { status: null, done: true, note: t("stopped"), memory: partialMemory(m) }))
      else {
        console.error("[assistant] request failed", err)
        update((m) => (m.done ? {} : { status: null, done: true, note: t("unreachable"), memory: partialMemory(m) }))
      }
    } finally {
      ctl.current = null
      setBusy(false)
    }
  }, [t, apiError])

  const stop = useCallback(() => ctl.current?.abort(), [])
  const reset = useCallback(() => {
    ctl.current?.abort()
    setMessages([])
  }, [])

  return { messages, busy, send, stop, reset }
}
