import type { AssistantCard, ChatMessage } from "@/lib/types/assistant"

/**
 * The viewer's current assistant chat, kept in this browser (#346), so
 * leaving /chat or reloading doesn't lose it. One chat per signed-in user,
 * under their id, so someone else signing in here never sees it. "New chat",
 * logging out and "Clear assistant history" remove it, and it's dropped
 * after 30 days without a new message, as the server drops the text of its
 * log. Storage that's blocked or full just means the chat isn't kept.
 *
 * Other tabs follow along through `storage` events (useAssistant), and a
 * small cookie (CHAT_COOKIE, the user's id, no content) tells the server to
 * render /chat in its conversation layout, so a reload doesn't flash the
 * empty state, and /home to link back to the conversation (#391).
 */

const PREFIX = "pf-assistant-chat:"
/** Bump when ChatMessage changes shape: an older saved chat is dropped, not misread. */
const VERSION = 1
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000
/** More than any conversation the API remembers (HISTORY_LIMITS.messages), so what's shown stays bounded. */
const MAX_MESSAGES = 60
/** Whose chat is saved in this browser; read by /chat's and /home's server pages (src/app/[locale]/(dashboard)/{chat,home}/page.tsx). */
export const CHAT_COOKIE = "pf-chat"

interface Saved {
  v: number
  savedAt: number
  messages: ChatMessage[]
}

/** The storage key of a user's chat: `storage` events name it. */
export const chatKey = (userId: string) => `${PREFIX}${userId}`

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage
  } catch {
    return null
  }
}

function setCookie(value: string | null) {
  try {
    document.cookie =
      value === null ? `${CHAT_COOKIE}=; path=/; max-age=0; samesite=lax` : `${CHAT_COOKIE}=${encodeURIComponent(value)}; path=/; max-age=${MAX_AGE_MS / 1000}; samesite=lax`
  } catch {
    // No document (tests on the server) or cookies blocked: /home just renders its default layout.
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null
const objects = (x: unknown) => Array.isArray(x) && x.every(isObject)

/** Enough of a card's shape that rendering it can't crash. */
function isCard(c: unknown): c is AssistantCard {
  if (!isObject(c)) return false
  switch (c.type) {
    case "places":
      return objects(c.places)
    case "route":
      return objects(c.stops) && Array.isArray(c.legs) && typeof c.totalMiles === "number"
    case "stats":
      return isObject(c.byKind) && objects(c.topRetailers)
    case "events":
      return objects(c.events)
    default:
      return false
  }
}

function isMessage(m: unknown): m is ChatMessage {
  if (!isObject(m) || typeof m.id !== "number" || typeof m.text !== "string") return false
  if (m.role === "user") return true
  return m.role === "assistant" && Array.isArray(m.cards) && m.cards.every(isCard) && typeof m.done === "boolean"
}

function read(store: Storage, userId: string, now: number): Saved | null {
  const raw = store.getItem(chatKey(userId))
  if (!raw) return null
  try {
    const saved = JSON.parse(raw) as Partial<Saved>
    if (saved.v === VERSION && typeof saved.savedAt === "number" && now - saved.savedAt <= MAX_AGE_MS && Array.isArray(saved.messages) && saved.messages.every(isMessage))
      return saved as Saved
  } catch {
    // Not JSON: dropped below.
  }
  store.removeItem(chatKey(userId))
  return null
}

/** The saved chat, or an empty list when there's none, it's too old, or it doesn't parse (which removes it). */
export function loadChat(userId: string, now = Date.now()): ChatMessage[] {
  const store = storage()
  if (!store) return []
  try {
    return read(store, userId, now)?.messages ?? []
  } catch {
    return []
  }
}

/** Saves the chat (its last messages), unless it's what's already saved; an empty one is removed. */
export function saveChat(userId: string, messages: readonly ChatMessage[], now = Date.now()): void {
  if (!messages.length) return clearChat(userId)
  const store = storage()
  if (!store) return
  let recent = messages.slice(-MAX_MESSAGES)
  // Start with a question, as the conversation does.
  while (recent[0]?.role === "assistant") recent = recent.slice(1)
  try {
    const json = JSON.stringify(recent)
    // Unchanged: no write, so restoring or leaving doesn't count as use, and two tabs showing
    // the same chat don't keep re-saving it to each other.
    if (JSON.stringify(read(store, userId, now)?.messages ?? null) === json) return
    store.setItem(chatKey(userId), `{"v":${VERSION},"savedAt":${now},"messages":${json}}`)
    setCookie(userId)
  } catch {
    // Full or blocked: the chat just isn't kept.
  }
}

export function clearChat(userId: string): void {
  try {
    storage()?.removeItem(chatKey(userId))
  } catch {
    // Blocked storage: nothing was saved.
  }
  setCookie(null)
}

const clearedListeners = new Set<() => void>()

/** Calls `listener` when this tab clears every chat (logout, "Clear assistant history"). Returns an unsubscribe. */
export function onChatsCleared(listener: () => void): () => void {
  clearedListeners.add(listener)
  return () => {
    clearedListeners.delete(listener)
  }
}

/**
 * Removes every saved chat in this browser: on logout, when whose they were
 * may no longer be known. An open conversation in this tab empties too
 * (onChatsCleared), and in other tabs through their `storage` events.
 */
export function clearAllChats(): void {
  const store = storage()
  try {
    const keys: string[] = []
    for (let i = 0; store && i < store.length; i++) {
      const key = store.key(i)
      if (key?.startsWith(PREFIX)) keys.push(key)
    }
    for (const key of keys) store?.removeItem(key)
  } catch {
    // Blocked storage: nothing was saved.
  }
  setCookie(null)
  for (const listener of clearedListeners) listener()
}
