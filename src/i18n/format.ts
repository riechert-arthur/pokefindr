import { useMemo } from "react"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { formatEventWhen, formatShortDate } from "@/lib/format/dates"
import type { LocationKind } from "@/lib/types/locations"

type FormatMessages = ReturnType<typeof useTranslations<"format">>
type NumberFormatter = Pick<ReturnType<typeof useFormatter>, "number">

/**
 * The formatters useFormat() returns, for a language, its "format" messages
 * and next-intl's number formatter. Tests build one with formatFor().
 */
export function makeFormat(locale: string, t: FormatMessages, format: NumberFormatter) {
  const kindCount = (kind: LocationKind, n: number, more = false) => t(`kinds.${kind}`, { count: n, more: more ? "+" : "" })
  return {
    /** "1,457" in English, "1457" in Spanish. */
    count: (n: number) => format.number(n),
    /** "1 vending machine", "12 card shops". */
    kindCount,
    /**
     * "12 vending machines" when one kind is shown, "12 places" otherwise.
     * `more` marks a capped count: "2,000+ places".
     */
    places: (n: number, kinds: readonly LocationKind[], more = false) =>
      kinds.length === 1 ? kindCount(kinds[0], n, more) : t("places", { count: n, more: more ? "+" : "" }),
    /** "Sat, Dec 6", "Dec 19–21". */
    eventWhen: (startsAt: string, endsAt: string | null) => formatEventWhen(startsAt, endsAt, locale),
    /** "just now", "5 min ago", "3 hr ago", "2 days ago", then "Mar 4" (with the year once it isn't this year). */
    ago: (iso: string, now = new Date()) => {
      const s = Math.max(0, (now.getTime() - new Date(iso).getTime()) / 1000)
      if (s < 60) return t("ago.now")
      if (s < 3600) return t("ago.minutes", { count: Math.floor(s / 60) })
      if (s < 86400) return t("ago.hours", { count: Math.floor(s / 3600) })
      const days = Math.floor(s / 86400)
      return days < 7 ? t("ago.days", { count: days }) : formatShortDate(iso, locale, now)
    },
  }
}

export type Format = ReturnType<typeof makeFormat>

/**
 * Numbers, counts and dates in the page's language (docs/i18n.md). Works in
 * Server and Client Components. Distances are in useDistance(), which also
 * needs the browser's region.
 */
export function useFormat(): Format {
  const format = useFormatter()
  const locale = useLocale()
  const t = useTranslations("format")
  return useMemo(() => makeFormat(locale, t, format), [format, locale, t])
}
