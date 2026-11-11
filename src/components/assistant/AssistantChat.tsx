"use client"

import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"
import { SquarePenIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { DASHBOARD_COLUMN as COLUMN } from "@/components/dashboard/column"
import { AgentMark } from "@/components/brand/AgentMark"
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
  /** The signed-in viewer: their current chat is kept in this browser (#346). */
  userId?: string | null
}

/** `newestRoute`: the index of the conversation's newest route card in this answer, if it's here. */
function AnswerView({ m, newestRoute }: { m: Extract<ChatMessage, { role: "assistant" }>; newestRoute: number }) {
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
          <AssistantCardView key={i} card={c} newestRoute={i === newestRoute} />
        ))}
        {m.note && <p className="text-caption text-muted-foreground">{m.note}</p>}
        {m.done && m.turnId && <FeedbackBar turnId={m.turnId} />}
      </div>
    </div>
  )
}

/** Where the conversation's newest route card is: its answer's id and its index among that answer's cards. */
function newestRouteCard(messages: readonly ChatMessage[]): { messageId: number; card: number } | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== "assistant") continue
    const card = m.cards.findLastIndex((c) => c.type === "route")
    if (card >= 0) return { messageId: m.id, card }
  }
  return null
}

/**
 * The dashboard's assistant: the composer (typing placeholder, Send, Stop)
 * and, once asked, the conversation above it with each answer's text and
 * cards. "New chat" clears it; until then it's kept in this browser (#346).
 */
export function AssistantChat({ viewer, suggestion, onSuggestionUsed, onChattingChange, userId = null }: AssistantChatProps) {
  const t = useTranslations("assistant")
  const { messages, busy, send, stop, reset } = useAssistant(userId)
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  const log = useRef<HTMLDivElement>(null)
  const chatting = messages.length > 0
  // The newest route card opens its map preview by itself; older ones wait for a click (#349).
  const newest = newestRouteCard(messages)

  // Before paint, so a restored chat replaces the suggestions and tiles without them flashing in.
  useLayoutEffect(() => onChattingChange(chatting), [chatting, onChattingChange])

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
          <div className={cn(COLUMN, "flex justify-end pb-1")}>
            {/* An outlined button with the usual new-conversation mark, so it reads as an action (#380). Mid-answer, it drops the answer too. */}
            <Button type="button" variant="outline" size="sm" onClick={reset}>
              <SquarePenIcon />
              {t("newChat")}
            </Button>
          </div>
          {/* Full width, so the scrollbar is at the window's edge and the margins scroll too. */}
          <div ref={log} aria-live="polite" className="min-h-0 flex-1 overflow-y-auto py-2">
            <div className={cn(COLUMN, "flex flex-col gap-4")}>
              {messages.map((m) =>
                m.role === "user" ? (
                  <p key={m.id} className="max-w-[92%] self-end whitespace-pre-wrap rounded-[14px_14px_4px_14px] bg-foreground px-3 py-2 text-body text-background sm:max-w-[80%]">
                    {m.text}
                  </p>
                ) : (
                  <AnswerView key={m.id} m={m} newestRoute={newest?.messageId === m.id ? newest.card : -1} />
                ),
              )}
            </div>
          </div>
        </div>
      )}
      <div className={COLUMN}>
        <Composer
          value={text}
          onChange={setText}
          onSubmit={ask}
          busy={busy}
          onStop={stop}
          onFocusChange={setFocused}
          placeholder={chatting ? t("followUp") : focused ? undefined : <TypingPlaceholder />}
        />
        <p className="mt-2 text-center text-caption text-muted-foreground">{t("disclaimer")}</p>
      </div>
    </>
  )
}
