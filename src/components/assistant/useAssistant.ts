"use client"

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import type { AssistantCard, ChatMessage } from "@/lib/types/assistant"
import type { AssistantEvent, AssistantTurn } from "@/lib/types/assistant-stream"
import { clipHistory, memoryOf } from "@/lib/assistant/memory"
import { chatKey, clearChat, loadChat, onChatsCleared, saveChat } from "@/lib/assistant/saved-chat"
import { track } from "@/lib/analytics"
import { useApiError, type ApiErrorBody } from "@/i18n/useApiError"

export type { ChatMessage }

/** What a turn that ended without `done` remembers: what came, cards included, so follow-ups can still use its places. */
const partialMemory = (m: { text: string; cards: AssistantCard[] }) => (m.text || m.cards.length ? memoryOf(m.text, m.cards) : null)

/**
 * The conversation as the API takes it: the viewer's words and each answer's
 * memory, the last turns only. A blocked question and its reply are left
 * out: the server checks every question it's sent and would block it again.
 */
function historyOf(messages: readonly ChatMessage[]): AssistantTurn[] {
  return clipHistory(
    messages.flatMap((m, i): AssistantTurn[] => {
      const next = messages[i + 1]
      if (m.role === "user") return next?.role === "assistant" && next.blocked ? [] : [{ role: "user", content: m.text }]
      if (m.blocked) return []
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

/** The chat as it's kept when the viewer leaves: an answer still streaming ends there, as Stop ends it. */
const settled = (messages: readonly ChatMessage[], stopped: string): ChatMessage[] =>
  messages.map((m) => (m.role === "assistant" && !m.done ? { ...m, status: null, done: true, note: m.note ?? stopped, memory: partialMemory(m) } : m))

/**
 * The assistant conversation on the page: sends each message with the
 * history to /api/assistant and fills in the answer as its events stream
 * (text, a status while tools run, cards). `stop` aborts the answer and
 * keeps what came; `reset` starts a new chat.
 *
 * With `userId`, the chat is kept in this browser (#346): restored when the
 * page opens, saved after each answer and when the viewer leaves mid-answer,
 * and removed by `reset` ("New chat").
 */
export function useAssistant(userId: string | null = null) {
  const t = useTranslations("assistant.chat")
  const apiError = useApiError()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  // Whose saved chat `messages` holds. State, not a ref, so nothing is saved
  // over a chat in the same commit that restores it.
  const [restoredFor, setRestoredFor] = useState<string | null>(null)
  const ctl = useRef<AbortController | null>(null)
  const nextId = useRef(1)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const stoppedRef = useRef(t("stopped"))
  stoppedRef.current = t("stopped")

  const adopt = useCallback((saved: ChatMessage[]) => {
    nextId.current = saved.reduce((max, m) => Math.max(max, m.id), 0) + 1
    // Now, not on the next render: a save as the page unmounts must see it.
    messagesRef.current = saved
    setMessages(saved)
  }, [])

  // Before the first paint, so a returning viewer never sees the empty dashboard flash in.
  useLayoutEffect(() => {
    if (!userId) return
    ctl.current?.abort()
    adopt(loadChat(userId))
    setRestoredFor(userId)
  }, [userId, adopt])

  // Follow the saved chat: logout or "Clear assistant history" in this tab
  // empties it, and so does New chat, logout or a newer answer in another tab
  // (its `storage` event), so no tab saves an old copy back over it.
  useEffect(() => {
    if (!userId) return
    const drop = () => {
      ctl.current?.abort()
      adopt([])
    }
    const onStorage = (e: StorageEvent) => {
      // `key` is null when the whole storage was cleared.
      if (e.key !== null && e.key !== chatKey(userId)) return
      if (e.newValue === null) return drop()
      // Mid-answer here: keep this tab's; it's saved when the answer ends.
      if (!ctl.current) adopt(loadChat(userId))
    }
    window.addEventListener("storage", onStorage)
    const off = onChatsCleared(drop)
    return () => {
      window.removeEventListener("storage", onStorage)
      off()
    }
  }, [userId, adopt])

  // After each change, but not while an answer streams: it's saved when it ends, or when the viewer leaves.
  useEffect(() => {
    if (userId && restoredFor === userId && !busy) saveChat(userId, messages)
  }, [messages, busy, userId, restoredFor])

  // Leaving the page (another page, a reload, closing the tab) keeps the answer that was streaming, stopped.
  useEffect(() => {
    if (!userId || restoredFor !== userId) return
    const keep = () => saveChat(userId, settled(messagesRef.current, stoppedRef.current))
    window.addEventListener("pagehide", keep)
    return () => {
      window.removeEventListener("pagehide", keep)
      keep()
    }
  }, [userId, restoredFor])

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
            blocked: event.blocked === true,
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
    if (userId) clearChat(userId)
  }, [userId])

  return { messages, busy, send, stop, reset }
}
