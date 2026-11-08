import type { AssistantCard } from "@/lib/types/assistant"
import type { AssistantTurn } from "@/lib/types/assistant-stream"

/** What /api/assistant accepts, so the page never sends a history it would refuse. */
export const HISTORY_LIMITS = { messages: 20, userChars: 2000, assistantChars: 4000 } as const

/**
 * What the next turn remembers of this one: the answer, plus the places it
 * showed (ids included, so "plan a route through those" works). The page
 * sends it back as this turn's assistant message. The server builds it when
 * a turn ends; the page builds it when the viewer stops one.
 */
export function memoryOf(text: string, cards: readonly AssistantCard[]): string {
  const lines = cards.flatMap((c) => {
    if (c.type === "places") return [`[${c.title}: ${c.places.map((p) => `${p.name}, ${p.city} (id ${p.id})`).join("; ")}]`]
    if (c.type === "route") return [`[Route: ${c.stops.map((p, i) => `${i + 1}. ${p.name} (id ${p.id})`).join("; ")}]`]
    if (c.type === "events") return [`[${c.title}: ${c.events.map((e) => `${e.title}, ${e.city} ${e.startsAt.slice(0, 10)}`).join("; ")}]`]
    return [`[${c.title}: ${c.total} places]`]
  })
  // Never empty: an empty assistant message would make the next request invalid.
  return [text.trim(), ...lines].filter(Boolean).join("\n") || "(No answer.)"
}

/** Keeps the end of a long text (the place ids sit at the end of a memory). */
const keepEnd = (s: string, max: number) => (s.length > max ? `…${s.slice(-(max - 1))}` : s)

/**
 * The last turns of a conversation, clipped to what the API accepts: at most
 * HISTORY_LIMITS.messages, starting with the viewer's, each within its
 * length. Older turns are dropped (the API drops them too).
 */
export function clipHistory(turns: readonly AssistantTurn[]): AssistantTurn[] {
  const recent = turns.slice(-HISTORY_LIMITS.messages)
  while (recent[0]?.role === "assistant") recent.shift()
  return recent.map((t) => ({ role: t.role, content: t.role === "user" ? t.content.slice(0, HISTORY_LIMITS.userChars) : keepEnd(t.content, HISTORY_LIMITS.assistantChars) }))
}
