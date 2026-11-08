"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { AssistantCard } from "@/lib/types/assistant"
import type { AssistantEvent, AssistantTurn } from "@/lib/types/assistant-stream"
import { clipHistory, memoryOf } from "@/lib/assistant/memory"

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

const STOPPED = "Stopped."

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

/** What to say when /api/assistant answers with an error status. */
async function refusalNote(res: Response): Promise<string> {
  if (res.status === 401) return "Your session ended. Log in again to keep chatting."
  const body = (await res.json().catch(() => null)) as { error?: string } | null
  return body?.error ?? "Something went wrong with the assistant. Try again."
}

/**
 * The assistant conversation on the page: sends each message with the
 * history to /api/assistant and fills in the answer as its events stream
 * (text, a status while tools run, cards). `stop` aborts the answer and
 * keeps what came; `reset` starts a new chat.
 */
export function useAssistant() {
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
    setMessages((ms) => [...ms, user, { id: answerId, role: "assistant", text: "", cards: [], status: "Thinking…", note: null, memory: null, turnId: null, done: false }])
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
        const note = await refusalNote(res)
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
        else if (event.type === "error") update((m) => ({ status: null, note: event.message, done: true, memory: partialMemory(m) }))
        else if (event.type === "done")
          update(() => ({
            status: null,
            memory: event.memory,
            turnId: event.turnId ?? null,
            done: true,
            note: event.stop === "max_tokens" ? "The answer was cut short. Ask for less at a time." : null,
          }))
      }
      update((m) => (m.done ? {} : { status: null, done: true, note: m.note ?? "The answer stopped early. Try again.", memory: partialMemory(m) }))
    } catch (err) {
      // Stop after the answer finished changes nothing.
      if (abort.signal.aborted) update((m) => (m.done ? {} : { status: null, done: true, note: STOPPED, memory: partialMemory(m) }))
      else {
        console.error("[assistant] request failed", err)
        update((m) => (m.done ? {} : { status: null, done: true, note: "Couldn't reach the assistant. Check your connection and try again.", memory: partialMemory(m) }))
      }
    } finally {
      ctl.current = null
      setBusy(false)
    }
  }, [])

  const stop = useCallback(() => ctl.current?.abort(), [])
  const reset = useCallback(() => {
    ctl.current?.abort()
    setMessages([])
  }, [])

  return { messages, busy, send, stop, reset }
}
