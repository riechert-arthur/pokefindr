"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { AgentMark } from "./AgentMark"
import { AssistantCardView } from "./AssistantCards"
import { AssistantText } from "./AssistantText"
import { Composer } from "./Composer"
import { FeedbackBar } from "./FeedbackBar"
import { TypingPlaceholder } from "./TypingPlaceholder"
import { useAssistant, type ChatMessage } from "./useAssistant"

interface AssistantChatProps {
  viewer: { lng: number; lat: number } | null
  /** A suggestion the viewer tapped: asked right away. */
  suggestion: string | null
  onSuggestionUsed: () => void
  onChattingChange: (chatting: boolean) => void
}

function AnswerView({ m }: { m: Extract<ChatMessage, { role: "assistant" }> }) {
  return (
    <div className="flex max-w-full items-start gap-2.5 text-body">
      <AgentMark size="sm" />
      <div className="grid min-w-0 flex-1 gap-2">
        {m.status && (
          <p className="flex items-center gap-2 text-muted-foreground" role="status">
            <span aria-hidden className="h-1.5 w-[22px] animate-pulse rounded-full bg-[radial-gradient(circle,hsl(var(--muted-foreground))_2.5px,transparent_3px)] bg-[length:8px_6px] bg-repeat-x motion-reduce:animate-none" />
            {m.status}
          </p>
        )}
        {m.text && <AssistantText text={m.text} />}
        {m.cards.map((c, i) => (
          <AssistantCardView key={i} card={c} />
        ))}
        {m.note && <p className="text-caption text-muted-foreground">{m.note}</p>}
        {m.done && m.turnId && <FeedbackBar turnId={m.turnId} />}
      </div>
    </div>
  )
}

/**
 * The dashboard's assistant: the composer (typing placeholder, Send, Stop)
 * and, once asked, the conversation above it with each answer's text and
 * cards. "New chat" clears it.
 */
export function AssistantChat({ viewer, suggestion, onSuggestionUsed, onChattingChange }: AssistantChatProps) {
  const { messages, busy, send, stop, reset } = useAssistant()
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const chatting = messages.length > 0

  useEffect(() => onChattingChange(chatting), [chatting, onChattingChange])

  const ask = (q: string) => {
    if (busy) return
    setText("")
    void send(q, viewer)
  }

  useEffect(() => {
    if (!suggestion) return
    onSuggestionUsed()
    ask(suggestion)
    // Only a new suggestion asks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion])

  // Keep the newest answer in view as it streams.
  useEffect(() => {
    const el = log.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  return (
    <>
      {chatting && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex justify-end pb-1">
            <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={busy}>
              New chat
            </Button>
          </div>
          <div ref={log} aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-0.5 py-2">
            {messages.map((m) =>
              m.role === "user" ? (
                <p key={m.id} className="max-w-[92%] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-foreground px-3 py-2 text-body text-background sm:max-w-[80%]">
                  {m.text}
                </p>
              ) : (
                <AnswerView key={m.id} m={m} />
              ),
            )}
          </div>
        </div>
      )}
      <div>
        <Composer
          value={text}
          onChange={setText}
          onSubmit={ask}
          busy={busy}
          onStop={stop}
          onFocusChange={setFocused}
          placeholder={chatting ? "Ask a follow-up…" : focused ? undefined : <TypingPlaceholder />}
        />
        <p className="mt-2 text-center text-caption text-muted-foreground">Distances are straight-line. Answers can be wrong, so check the map.</p>
      </div>
    </>
  )
}
