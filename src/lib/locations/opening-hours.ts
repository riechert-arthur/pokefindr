/**
 * A shop's opening hours as a week (#401), from OpenStreetMap's
 * `opening_hours` format: the common part of it, which covers almost every
 * card shop ("Mo-Sa 10:00-18:00; Su 11:00-18:00").
 *
 * - Rules are separated by `;`, or by `,` after a time ("Mo-Fr 12:00-20:00,
 *   Sa 11:00-18:00"). Each is `[days] times`, where `times` is
 *   `HH:MM-HH:MM` (several separated by commas), `off` or `closed`.
 * - Days: `Mo` to `Su`, ranges (`Mo-Fr`, wrapping `Fr-Mo`) and lists
 *   (`Mo,We-Th`). A rule without days applies to every day.
 * - A later rule replaces an earlier one for its days; days no rule names
 *   are closed. `24/7` is open all the time.
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

const DAY_SPEC = /^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?$/
const TIME_SPEC = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/

/** "Mo-Fr" → [0..4]; "Fr-Mo" → [4, 5, 6, 0]. Null if not a day spec. */
function days(spec: string): number[] | null {
  const out: number[] = []
  for (const part of spec.split(",")) {
    const m = DAY_SPEC.exec(part.trim())
    if (!m) return null
    const from = DAYS.indexOf(m[1] as (typeof DAYS)[number])
    const to = m[2] ? DAYS.indexOf(m[2] as (typeof DAYS)[number]) : from
    for (let d = from; ; d = (d + 1) % 7) {
      if (!out.includes(d)) out.push(d)
      if (d === to) break
    }
  }
  return out
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
  // A comma after a time, then a day, starts another rule.
  const rules = value.replace(/(\d|off|closed)\s*,\s*(?=(?:Mo|Tu|We|Th|Fr|Sa|Su|PH|SH)\b)/g, "$1;").split(";")
  for (const raw of rules) {
    // Holidays in a day list ("Su,Mo,PH off") are dropped with their comma.
    const rule = raw.trim().replace(/\b(?:PH|SH)\s*,\s*/g, "").replace(/\s*,\s*(?:PH|SH)\b/g, "")
    if (!rule) continue
    // Holiday rules: skipped, so the week shows the usual hours.
    if (/^(PH|SH)\b/.test(rule)) continue
    // "Mo-Fr 10:00-18:00", "Mo, We-Th 15:00-20:00", "11:00-19:00", "Su off".
    const m = /^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,\s*)*(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)?\s*(.+)$/.exec(rule)
    if (!m) return null
    const which = m[1] ? days(m[1].replace(/\s+/g, "")) : [0, 1, 2, 3, 4, 5, 6]
    const open = times(m[2].trim())
    if (!which || !open) return null
    for (const d of which) week[d] = open
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
