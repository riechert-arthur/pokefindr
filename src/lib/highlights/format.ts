const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" })
const MONTH_DAY = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" })
const DAY_ONLY = new Intl.DateTimeFormat("en-US", { day: "numeric" })

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString()

/**
 * When an event is, as the copy guide writes dates: "Sat, Dec 6" for one
 * day, "Dec 19–21" for several, "Nov 30–Dec 2" across months.
 */
export function formatEventWhen(startsAt: string, endsAt: string | null): string {
  const start = new Date(startsAt)
  const end = endsAt ? new Date(endsAt) : null
  if (!end || sameDay(start, end)) return DAY.format(start)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  return `${MONTH_DAY.format(start)}–${(sameMonth ? DAY_ONLY : MONTH_DAY).format(end)}`
}
