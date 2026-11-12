"use client"

import { useId, useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { parseOpeningHours, sameEveryDay, weekdayIndex, type Interval } from "@/lib/locations/opening-hours"
import { cn } from "@/lib/utils"

/** Monday to Sunday in the viewer's language, capitalized ("lunes" → "Lunes"). 2024-01-01 was a Monday. */
function dayNames(locale: string): string[] {
  const f = new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" })
  return Array.from({ length: 7 }, (_, i) => {
    const name = f.format(new Date(Date.UTC(2024, 0, 1 + i)))
    return name.charAt(0).toLocaleUpperCase(locale) + name.slice(1)
  })
}

/** Whether the language's clock is 12-hour ("10 AM") rather than 24-hour ("10:00"). */
const twelveHour = (locale: string) => new Intl.DateTimeFormat(locale, { hour: "numeric", timeZone: "UTC" }).resolvedOptions().hour12 === true

/** "10 AM", "6:30 PM" in English; "10:00", "18:30" in Spanish (a 24-hour clock always shows its minutes). */
function clock(locale: string, minutes: number): string {
  const m = minutes % (24 * 60)
  const f = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: m % 60 || !twelveHour(locale) ? "2-digit" : undefined, timeZone: "UTC" })
  return f.format(new Date(Date.UTC(2024, 0, 1, 0, m)))
}

/**
 * A shop's opening hours in its details (#401). Hours in OpenStreetMap's
 * format become a week: one line when every day is the same; otherwise
 * collapsed to today's, with the whole week a click away, today in bold.
 * Free text, and hours the parser can't read, show as written.
 * "Today" is the viewer's day, which is the shop's for anyone nearby.
 */
export function ShopHours({ hours, now = new Date() }: { hours: string; now?: Date }) {
  const t = useTranslations("details.hours")
  const locale = useLocale()
  const [open, setOpen] = useState(false)
  const listId = useId()
  const week = parseOpeningHours(hours)
  if (!week) return <span className="whitespace-pre-wrap">{hours}</span>

  const span = (day: Interval[]) => {
    if (!day.length) return t("closed")
    if (day.length === 1 && day[0].start === 0 && day[0].end >= 24 * 60) return t("allDay")
    return day.map((i) => `${clock(locale, i.start)} – ${clock(locale, i.end)}`).join(", ")
  }
  if (sameEveryDay(week)) return <span>{t("everyDay", { hours: span(week[0]) })}</span>

  const today = weekdayIndex(now)
  const names = dayNames(locale)
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((o) => !o)}
        className="-mx-1 inline-flex items-center gap-1 self-start rounded px-1 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {t("today", { hours: span(week[today]) })}
        <span className="sr-only">{t("week")}</span>
        <ChevronDownIcon className={cn("size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <ul id={listId} className="grid gap-0.5">
          {week.map((day, i) => (
            <li key={names[i]} aria-current={i === today ? "date" : undefined} className={cn("grid grid-cols-[minmax(0,6rem)_minmax(0,1fr)] gap-2", i === today && "font-semibold")}>
              <span>{names[i]}</span>
              <span>{span(day)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
