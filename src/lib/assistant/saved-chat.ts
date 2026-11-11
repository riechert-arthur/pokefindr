import type { ChatMessage } from "@/components/assistant/useAssistant"

/**
 * The viewer's current assistant chat, kept in this browser (#346), so
 * leaving /home or reloading doesn't lose it. One chat per signed-in user,
 * under their id, so someone else signing in here never sees it. "New chat",
 * logging out and "Clear assistant history" remove it, and it's dropped
 * after 30 days without use, as the server drops the text of its log.
 * Storage that's blocked or full just means the chat isn't kept.
 */

const PREFIX = "pf-assistant-chat:"
/** Bump when ChatMessage changes shape: an older saved chat is dropped, not misread. */
const VERSION = 1
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** More than any conversation the API remembers (HISTORY_LIMITS.messages), so what's shown stays bounded. */
const MAX_MESSAGES = 60

interface Saved {
  v: number
  savedAt: number
  messages: ChatMessage[]
}

const keyOf = (userId: string) => `${PREFIX}${userId}`

/**
 * Set by clearAllChats (logout, "Clear assistant history") until a chat is
 * next loaded, so the dashboard saving as it unmounts on the way to /login
 * can't put the chat back.
 */
let cleared = false

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

const isMessage = (m: unknown): m is ChatMessage => {
  if (!m || typeof m !== "object") return false
  const { id, role, text } = m as Record<string, unknown>
  if (typeof id !== "number" || typeof text !== "string") return false
  if (role === "user") return true
  if (role !== "assistant") return false
  const a = m as Record<string, unknown>
  return Array.isArray(a.cards) && typeof a.done === "boolean"
}

/** The saved chat, or an empty list when there's none, it's too old, or it doesn't parse (which removes it). */
export function loadChat(userId: string, now = Date.now()): ChatMessage[] {
  cleared = false
  const store = storage()
  if (!store) return []
  try {
    const raw = store.getItem(keyOf(userId))
    if (!raw) return []
    const saved = JSON.parse(raw) as Partial<Saved>
    if (saved.v !== VERSION || typeof saved.savedAt !== "number" || now - saved.savedAt > MAX_AGE_MS || !Array.isArray(saved.messages) || !saved.messages.every(isMessage)) {
      store.removeItem(keyOf(userId))
      return []
    }
    return saved.messages
  } catch {
    try {
      store.removeItem(keyOf(userId))
    } catch {
      // Blocked storage: nothing to remove.
    }
    return []
  }
}

/** Saves the chat (its last messages); an empty one is removed. */
export function saveChat(userId: string, messages: readonly ChatMessage[], now = Date.now()): void {
  if (!messages.length) return clearChat(userId)
  if (cleared) return
  const store = storage()
  if (!store) return
  let recent = messages.slice(-MAX_MESSAGES)
  // Start with a question, as the conversation does.
  while (recent[0]?.role === "assistant") recent = recent.slice(1)
  try {
    store.setItem(keyOf(userId), JSON.stringify({ v: VERSION, savedAt: now, messages: recent } satisfies Saved))
  } catch {
    // Full or blocked: the chat just isn't kept.
  }
}

export function clearChat(userId: string): void {
  try {
    storage()?.removeItem(keyOf(userId))
  } catch {
    // Blocked storage: nothing was saved.
  }
}

/** Removes every saved chat in this browser: on logout, when whose they were may no longer be known. */
export function clearAllChats(): void {
  cleared = true
  const store = storage()
  if (!store) return
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  } catch {
    // Blocked storage: nothing was saved.
  }
}
