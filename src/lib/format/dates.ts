/**
 * When an event is, written for `locale` as the copy guide writes dates: one
 * day with its weekday ("Sat, Dec 6", "sáb, 6 dic"), several as a range
 * ("Dec 19–21", "Nov 30–Dec 2", "19–21 dic"). In the viewer's time zone.
 */
export function formatEventWhen(startsAt: string, endsAt: string | null, locale: string): string {
  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : null
  if (!end || start.toDateString() === end.toDateString()) {
    return new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }).format(start)
  }
  const range = new Intl.DateTimeFormat(locale, { month: "short", day: "numeric" }).formatRange(start, end)
  // Ranges are set closed up ("Dec 19–21"), where Intl spaces the dash.
  return range.replace(/\s*–\s*/, "–")
}

/** "Mar 4", with the year once it isn't this year: an older date in "x ago" copy. */
export function formatShortDate(iso: string, locale: string, now = new Date()): string {
  const then = new Date(iso)
  return then.toLocaleDateString(locale, { month: "short", day: "numeric", ...(then.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) })
}
