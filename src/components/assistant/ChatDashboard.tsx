"use client"

import { useLayoutEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { AgentMark } from "@/components/brand/AgentMark"
import { DashboardFrame } from "@/components/dashboard/DashboardFrame"
import { DASHBOARD_COLUMN } from "@/components/dashboard/column"
import { hasHandOff, sharedViewer, takeHandOff } from "@/lib/assistant/hand-off"
import { cn } from "@/lib/utils"
import { AssistantChat } from "./AssistantChat"
import { SuggestionChips } from "./Suggestions"

/**
 * /chat (#391): the assistant's conversation, on its own dashboard page so
 * /home keeps the account's tiles. It asks what /home handed over, and keeps
 * the saved conversation (#346). With none, it shows the composer with a short
 * greeting and the suggestions.
 */
export function ChatDashboard({ userId, hasSavedChat }: { userId: string | null; hasSavedChat: boolean }) {
  const t = useTranslations("assistant")
  // The conversation's layout when one is saved, so a reload doesn't paint the empty state first.
  const [chatting, setChatting] = useState(hasSavedChat)
  const [suggestion, setSuggestion] = useState<string | null>(null)
  // A question asked on /home: the composer has focus, as it had there.
  const [handedOver] = useState(hasHandOff)
  const [viewer] = useState(sharedViewer)

  // Before paint, as AssistantChat restores and asks, so a handed-over
  // question never shows the empty state first. An effect, so React's
  // development double mount takes it once: the second run finds nothing.
  useLayoutEffect(() => {
    const question = takeHandOff()
    if (question) setSuggestion(question)
  }, [])

  return (
    <DashboardFrame>
      {/* Full width: the chat keeps its parts in the column itself, so its scrollbar sits at the window's edge (#383). */}
      <main
        className={
          chatting
            ? "flex min-h-0 w-full flex-1 flex-col gap-4 pb-4 pt-2"
            : "flex min-h-0 w-full flex-1 flex-col justify-start gap-[18px] overflow-y-auto pb-7 pt-4 md:justify-center md:pt-2"
        }
      >
        {/* The page's heading stays for screen readers during the conversation. */}
        <div className={chatting ? "sr-only" : cn(DASHBOARD_COLUMN, "grid justify-items-center gap-2.5 text-center")}>
          {!chatting && <AgentMark size="lg" />}
          <h1 className="mt-1.5 text-balance text-title text-foreground">{t("emptyTitle")}</h1>
          {!chatting && <p className="max-w-[52ch] text-subheading font-normal text-muted-foreground">{t("emptyBody")}</p>}
        </div>
        <AssistantChat viewer={viewer} suggestion={suggestion} onSuggestionUsed={() => setSuggestion(null)} onChattingChange={setChatting} userId={userId} autoFocus={handedOver} />
        {!chatting && (
          <div className={DASHBOARD_COLUMN}>
            <SuggestionChips located={viewer !== null} onPick={setSuggestion} />
          </div>
        )}
      </main>
    </DashboardFrame>
  )
}
