const formatters = new Map<string, Intl.DateTimeFormat>()

/** One formatter per language and options: building them is slow, and event rows render often. */
function dateFormat(locale: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = formatters.get(key)
  if (!format) formatters.set(key, (format = new Intl.DateTimeFormat(locale, options)))
  return format
}

const DAY: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }

/**
 * When an event is, written for `locale` as the copy guide writes dates: one
 * day with its weekday ("Sat, Dec 6", "sáb, 6 dic"), several as a range
 * ("Dec 19–21", "Nov 30–Dec 2", "19–21 dic"), with no year even across one
 * ("Dec 30–Jan 2"). In the viewer's time zone.
 */
export function formatEventWhen(startsAt: string, endsAt: string | null, locale: string): string {
  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : null
  if (!end || start.toDateString() === end.toDateString()) {
    return dateFormat(locale, { weekday: "short", ...DAY }).format(start)
  }
  // Intl adds both years to a range across New Year; events are weeks long at most.
  if (start.getFullYear() !== end.getFullYear()) return `${dateFormat(locale, DAY).format(start)}–${dateFormat(locale, DAY).format(end)}`
  const range = dateFormat(locale, DAY).formatRange(start, end)
  // Ranges are set closed up ("Dec 19–21"), where Intl spaces the dash.
  return range.replace(/\s*–\s*/, "–")
}

/** "Mar 4", with the year once it isn't this year: an older date in "x ago" copy. */
export function formatShortDate(iso: string, locale: string, now = new Date()): string {
  const then = new Date(iso)
  return dateFormat(locale, { ...DAY, ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) }).format(then)
}
