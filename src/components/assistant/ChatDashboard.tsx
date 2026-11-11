"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import { AgentMark } from "@/components/brand/AgentMark"
import { DashboardFrame } from "@/components/dashboard/DashboardFrame"
import { hasHandOff, takeHandOff, type Viewer } from "@/lib/assistant/hand-off"
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
  // Start in the conversation's layout when one is saved or a question was
  // just handed over, so neither paints the empty state first.
  const [chatting, setChatting] = useState(() => hasSavedChat || hasHandOff())
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [viewer, setViewer] = useState<Viewer | null>(null)

  // The question asked on /home. An effect, so React's development double
  // mount takes it once: the second run finds nothing.
  useEffect(() => {
    const handed = takeHandOff()
    if (!handed) return
    setViewer(handed.viewer)
    setSuggestion(handed.question)
  }, [])

  return (
    <DashboardFrame>
      <main
        className={
          chatting
            ? // Full width: the chat keeps its parts in the 780px column itself, so its scrollbar sits at the window's edge (#383).
              "flex min-h-0 w-full flex-1 flex-col gap-4 pb-4 pt-2"
            : "mx-auto flex min-h-0 w-full max-w-[780px] flex-1 flex-col justify-start gap-[18px] overflow-y-auto px-4 pb-7 pt-4 md:justify-center md:pt-2"
        }
      >
        {!chatting && (
          <div className="grid justify-items-center gap-2.5 text-center">
            <AgentMark size="lg" />
            <h1 className="mt-1.5 text-balance text-title text-foreground">{t("emptyTitle")}</h1>
            <p className="max-w-[52ch] text-subheading font-normal text-muted-foreground">{t("emptyBody")}</p>
          </div>
        )}
        <AssistantChat viewer={viewer} suggestion={suggestion} onSuggestionUsed={() => setSuggestion(null)} onChattingChange={setChatting} userId={userId} />
        {!chatting && <SuggestionChips located={viewer !== null} onPick={setSuggestion} />}
      </main>
    </DashboardFrame>
  )
}
