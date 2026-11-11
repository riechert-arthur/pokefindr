"use client"

import { useLayoutEffect, useState } from "react"
import { MessagesSquareIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Link, useRouter } from "@/i18n/navigation"
import { handOff, type Viewer } from "@/lib/assistant/hand-off"
import { loadChat } from "@/lib/assistant/saved-chat"
import { Composer } from "./Composer"
import { SuggestionChips } from "./Suggestions"
import { TypingPlaceholder } from "./TypingPlaceholder"

interface AssistantEntryProps {
  viewer: Viewer | null
  userId: string | null
  /** The server's answer to whether this browser has the viewer's conversation saved (#346), from its cookie. */
  hasSavedChat: boolean
}

/**
 * /home's way into the assistant (#391): the composer with its typing
 * placeholder, then the suggestions. Asking, typed or tapped, opens /chat,
 * which asks it there; /home itself never turns into the conversation.
 */
export function AssistantEntry({ viewer, userId, hasSavedChat }: AssistantEntryProps) {
  const t = useTranslations("assistant")
  const router = useRouter()
  const [text, setText] = useState("")
  const [focused, setFocused] = useState(false)
  const [saved, setSaved] = useState(hasSavedChat)

  // Back and Forward reuse the server's answer from before a chat was saved
  // or cleared, so check this browser's own copy before paint.
  useLayoutEffect(() => setSaved(userId !== null && loadChat(userId).length > 0), [userId])

  const ask = (question: string) => {
    const q = question.trim()
    if (!q) return
    handOff(q)
    router.push("/chat")
  }

  return (
    <>
      <div>
        <Composer value={text} onChange={setText} onSubmit={ask} onFocusChange={setFocused} placeholder={focused ? undefined : <TypingPlaceholder />} />
        <p className="mt-2 text-center text-caption text-muted-foreground">{t("disclaimer")}</p>
        {saved && (
          <p className="mt-2 text-center">
            <Link href="/chat" className="inline-flex items-center gap-1.5 text-body text-primary underline-offset-4 hover:underline">
              <MessagesSquareIcon className="size-4" aria-hidden />
              {t("continueChat")}
            </Link>
          </p>
        )}
      </div>
      <SuggestionChips located={viewer !== null} onPick={ask} />
    </>
  )
}
