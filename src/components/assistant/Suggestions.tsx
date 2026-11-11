"use client"

import { useTranslations } from "next-intl"

/** The prototype's suggestions, one tap to ask (dashboard.suggestions in the catalog). */
export const SUGGESTIONS = ["portland", "denver", "washington", "phoenix"] as const

const chip =
  "rounded-full border border-border bg-card/85 px-3 py-1 text-body text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"

/** One-tap questions for the assistant, on /home and on an empty /chat. With the viewer's location, "closest to me" comes first. */
export function SuggestionChips({ located, onPick }: { located: boolean; onPick: (question: string) => void }) {
  const t = useTranslations("dashboard")
  return (
    <div role="group" className="flex flex-wrap justify-center gap-2" aria-label={t("suggestionsLabel")}>
      {(located ? (["closest", ...SUGGESTIONS] as const) : SUGGESTIONS)
        .map((key) => t(`suggestions.${key}`))
        .map((s) => (
          <button key={s} type="button" className={chip} onClick={() => onPick(s)}>
            {s}
          </button>
        ))}
    </div>
  )
}
