/**
 * A shop's opening hours as a week (#401), from OpenStreetMap's
 * `opening_hours` format: the common part of it, which covers almost every
 * card shop ("Mo-Sa 10:00-18:00; Su 11:00-18:00").
 *
 * - Rules are separated by `;`, or by `,` after a time ("Mo-Fr 12:00-20:00,
 *   Sa 11:00-18:00"). After `;` a rule replaces its days' hours; after `,`
 *   it adds to them ("Mo-Fr 08:00-12:00, We 14:00-18:00"). Each is `[days] times`, where `times` is
 *   `HH:MM-HH:MM` (several separated by commas), `off` or `closed`.
 * - Days: `Mo` to `Su`, ranges (`Mo-Fr`, wrapping `Fr-Mo`) and lists
 *   (`Mo,We-Th`). A rule without days applies to every day.
 * - Days no rule names are closed. `24/7` is open all the time.
 * - Holiday rules (`PH`, `SH`) are skipped, and `PH` in a day list
 *   ("Su,Mo,PH off") is dropped: we show a normal week.
 *
 * Anything else (months, weeks, `sunrise`, `10:00+`, comments) returns null,
 * and the caller shows the text as written.
 */

/** Minutes after midnight; an end may be past 24:00 for hours that run past midnight. */
export interface Interval {
  start: number
  end: number
}

/** Monday first: [Mo, Tu, We, Th, Fr, Sa, Su]. An empty day is closed. */
export type Week = Interval[][]

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"] as const
const ALL_DAY: Interval = { start: 0, end: 24 * 60 }

/** One day, a range ("Mo-Fr", or wrapping "Fr-Mo"), and a list of either ("Mo, We-Th"), as regex source. */
const DAY = `(?:${DAYS.join("|")})`
const DAY_RANGE = `${DAY}(?:-${DAY})?`
const DAY_LIST = `${DAY_RANGE}(?:\\s*,\\s*${DAY_RANGE})*`
/** A rule: an optional day list, then its times. */
const RULE = new RegExp(`^(${DAY_LIST})?\\s*(.+)$`)
/** A comma after a time (or off), then a day or holiday: another rule, which adds to the hours. */
const ADDITIONAL = new RegExp(`(\\d|off|closed)\\s*,\\s*(?=(?:${DAYS.join("|")}|PH|SH)\\b)`, "g")
const TIME_SPEC = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/

/** A day list the RULE regex matched → day indexes: "Mo-Fr" → [0..4]; "Fr-Mo" → [4, 5, 6, 0]. */
function days(list: string): number[] {
  const out = new Set<number>()
  for (const range of list.split(",")) {
    const [from, to = from] = range.trim().split("-").map((d) => DAYS.indexOf(d.trim() as (typeof DAYS)[number]))
    for (let d = from; ; d = (d + 1) % 7) {
      out.add(d)
      if (d === to) break
    }
  }
  return [...out]
}

/** "10:00-18:00,19:00-21:00" → intervals; "off"/"closed" → []. Null if not times. */
function times(spec: string): Interval[] | null {
  if (spec === "off" || spec === "closed") return []
  const out: Interval[] = []
  for (const part of spec.split(",")) {
    const m = TIME_SPEC.exec(part.trim())
    if (!m) return null
    const [h1, m1, h2, m2] = m.slice(1).map(Number)
    if (h1 > 24 || h2 > 48 || m1 > 59 || m2 > 59) return null
    const start = h1 * 60 + m1
    let end = h2 * 60 + m2
    // "18:00-02:00": open past midnight.
    if (end <= start) end += 24 * 60
    out.push({ start, end })
  }
  return out
}

export function parseOpeningHours(text: string | null | undefined): Week | null {
  const value = text?.trim()
  if (!value) return null
  if (value === "24/7") return DAYS.map(() => [ALL_DAY])
  const week: Week = DAYS.map(() => [])
  let any = false
  // "&" marks a rule after a comma: it adds to its days' hours instead of replacing them.
  for (const raw of value.replace(ADDITIONAL, "$1;&").split(";")) {
    const adds = raw.trim().startsWith("&")
    // Holidays in a day list ("Su,Mo,PH off") are dropped with their comma.
    const rule = raw.trim().replace(/^&/, "").trim().replace(/\b(?:PH|SH)\s*,\s*/g, "").replace(/\s*,\s*(?:PH|SH)\b/g, "")
    if (!rule) continue
    // Holiday rules: skipped, so the week shows the usual hours.
    if (/^(PH|SH)\b/.test(rule)) continue
    const m = RULE.exec(rule)
    const open = m && times(m[2].trim())
    if (!m || !open) return null
    for (const d of m[1] ? days(m[1]) : [0, 1, 2, 3, 4, 5, 6]) {
      week[d] = adds && open.length ? [...week[d], ...open].sort((a, b) => a.start - b.start) : open
    }
    any = true
  }
  return any ? week : null
}

/** Whether every day has the same hours (then one line says it all). */
export function sameEveryDay(week: Week): boolean {
  const first = JSON.stringify(week[0])
  return week.every((d) => JSON.stringify(d) === first)
}

/** Today's index in a Week (Monday 0), from a date in the viewer's time zone. */
export const weekdayIndex = (date: Date) => (date.getDay() + 6) % 7
