"use client"

import { useEffect, useState } from "react"
import { MessagesSquareIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { handOff, type Viewer } from "@/lib/assistant/hand-off"
import { Composer } from "./Composer"
import { TypingPlaceholder } from "./TypingPlaceholder"

interface AssistantEntryProps {
  viewer: Viewer | null
  /** A suggestion tapped on /home, to ask. */
  suggestion: string | null
  onSuggestionUsed: () => void
  /** This browser has the viewer's conversation saved (#346): link back to it. */
  hasSavedChat: boolean
}

/**
 * /home's way into the assistant (#391): the composer with its typing
 * placeholder. Asking, typed or a tapped suggestion, opens /chat, which asks
 * it there; /home itself never turns into the conversation.
 */
export function AssistantEntry({ viewer, suggestion, onSuggestionUsed, hasSavedChat }: AssistantEntryProps) {
  const t = useTranslations("assistant")
  const router = useRouter()
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)

  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    handOff(q, viewer)
    router.push("/chat")
  }

  useEffect(() => {
    if (!suggestion) return
    onSuggestionUsed()
    ask(suggestion)
    // Only a new suggestion asks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestion])

  return (
    <div>
      <Composer value={text} onChange={setText} onSubmit={ask} onFocusChange={setFocused} placeholder={focused ? undefined : <TypingPlaceholder />} />
      <p className="mt-2 text-center text-caption text-muted-foreground">{t("disclaimer")}</p>
      {hasSavedChat && (
        <p className="mt-2 text-center">
          <Link href="/chat" className="inline-flex items-center gap-1.5 text-body text-primary underline-offset-4 hover:underline">
            <MessagesSquareIcon className="size-4" aria-hidden />
            {t("continueChat")}
          </Link>
        </p>
      )}
    </div>
  )
}
