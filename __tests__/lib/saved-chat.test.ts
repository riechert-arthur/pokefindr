import { afterEach, describe, expect, it, vi } from "vitest"
import { clearAllChats, clearChat, loadChat, onChatsCleared, saveChat } from "@/lib/assistant/saved-chat"
import type { ChatMessage } from "@/lib/types/assistant"

const q = (id: number, text: string): ChatMessage => ({ id, role: "user", text })
const a = (id: number, text: string): ChatMessage => ({ id, role: "assistant", text, cards: [], status: null, note: null, memory: `${text} [id loc-${id}]`, turnId: `t${id}`, done: true })
const chat = [q(1, "machines in Seattle?"), a(2, "Safeway is closest.")]
const DAY = 24 * 60 * 60 * 1000

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
  document.cookie = "pf-chat=; path=/; max-age=0"
})

describe("the assistant chat kept in the browser (#346)", () => {
  it("saves and restores a user's chat", () => {
    saveChat("u1", chat)
    expect(loadChat("u1")).toEqual(chat)
  })

  it("keeps each user's chat apart", () => {
    saveChat("u1", chat)
    expect(loadChat("u2")).toEqual([])
  })

  it("drops a chat unused for 30 days", () => {
    const now = Date.now()
    saveChat("u1", chat, now - 31 * DAY)
    expect(loadChat("u1", now)).toEqual([])
    expect(localStorage.length).toBe(0)
    saveChat("u1", chat, now - 29 * DAY)
    expect(loadChat("u1", now)).toEqual(chat)
  })

  it.each([
    ["not JSON", "{oops"],
    ["an older format", JSON.stringify({ v: 0, savedAt: Date.now(), messages: chat })],
    ["a bad message", JSON.stringify({ v: 1, savedAt: Date.now(), messages: [{ id: "1", role: "user", text: "hi" }] })],
    ["a card that would crash rendering", JSON.stringify({ v: 1, savedAt: Date.now(), messages: [chat[0], { ...chat[1], cards: [{ type: "route", stops: null }] }] })],
    ["a card of an unknown type", JSON.stringify({ v: 1, savedAt: Date.now(), messages: [chat[0], { ...chat[1], cards: [{ type: "weather" }] }] })],
  ])("drops %s, and removes it", (_, raw) => {
    localStorage.setItem("pf-assistant-chat:u1", raw)
    expect(loadChat("u1")).toEqual([])
    expect(localStorage.getItem("pf-assistant-chat:u1")).toBeNull()
  })

  it("keeps the last messages, starting with a question", () => {
    const long = Array.from({ length: 70 }, (_, i) => (i % 2 ? a(i + 1, `answer ${i}`) : q(i + 1, `question ${i}`)))
    saveChat("u1", long)
    const kept = loadChat("u1")
    expect(kept.length).toBeLessThanOrEqual(60)
    expect(kept[0].role).toBe("user")
    expect(kept.at(-1)).toEqual(long.at(-1))
  })

  it("removes an empty chat, and clearChat removes one user's", () => {
    saveChat("u1", chat)
    saveChat("u2", chat)
    saveChat("u1", [])
    expect(loadChat("u1")).toEqual([])
    clearChat("u2")
    expect(loadChat("u2")).toEqual([])
  })

  it("clears every chat on logout and tells this tab's open chat", () => {
    saveChat("u1", chat)
    saveChat("u2", chat)
    localStorage.setItem("other", "kept")
    const cleared = vi.fn()
    const off = onChatsCleared(cleared)
    clearAllChats()
    off()
    expect(localStorage.length).toBe(1)
    expect(cleared).toHaveBeenCalledTimes(1)
  })

  it("doesn't write a chat that's already saved, so restoring or leaving isn't counted as use", () => {
    const now = Date.now()
    saveChat("u1", chat, now - 29 * DAY)
    const setItem = vi.spyOn(Storage.prototype, "setItem")
    saveChat("u1", chat, now)
    expect(setItem).not.toHaveBeenCalled()
    // Still dated from the last real change, so it expires a day later.
    expect(loadChat("u1", now + 2 * DAY)).toEqual([])
  })

  it("leaves a cookie with the user's id while a chat is saved, for the server to render the chat layout", () => {
    saveChat("u1", chat)
    expect(document.cookie).toContain("pf-chat=u1")
    clearChat("u1")
    expect(document.cookie).not.toContain("pf-chat=u1")
    saveChat("u1", chat)
    clearAllChats()
    expect(document.cookie).not.toContain("pf-chat=u1")
  })

  it("does nothing, without throwing, when storage is blocked or full", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError")
    })
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError")
    })
    expect(() => saveChat("u1", chat)).not.toThrow()
    expect(loadChat("u1")).toEqual([])
    expect(() => clearAllChats()).not.toThrow()
  })
})
