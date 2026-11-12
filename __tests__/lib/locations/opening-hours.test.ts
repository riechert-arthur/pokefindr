import { describe, expect, it } from "vitest"
import { parseOpeningHours, sameEveryDay, weekdayIndex, type Week } from "@/lib/locations/opening-hours"

const h = (from: string, to: string) => {
  const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3))
  const start = m(from)
  let end = m(to)
  if (end <= start) end += 24 * 60
  return { start, end }
}
const closed: never[] = []

describe("parseOpeningHours (#401)", () => {
  it("reads day ranges and single days", () => {
    expect(parseOpeningHours("Mo-Sa 10:00-18:00; Su 11:00-18:00")).toEqual([...Array(6).fill([h("10:00", "18:00")]), [h("11:00", "18:00")]])
  })

  it("reads lists with spaces, and leaves days no rule names closed", () => {
    const week = parseOpeningHours("Mo, We-Th 15:00-20:00; Fr 15:00-21:00")!
    expect(week[0]).toEqual([h("15:00", "20:00")])
    expect(week[1]).toEqual(closed)
    expect(week[2]).toEqual([h("15:00", "20:00")])
    expect(week[4]).toEqual([h("15:00", "21:00")])
    expect(week[5]).toEqual(closed)
  })

  it("reads off and closed, a rule without days, and later rules overriding earlier ones", () => {
    const week = parseOpeningHours("11:00-19:00; Mo,Su off; Tu closed; Sa 10:00-17:00")!
    expect(week.map((d) => d.length)).toEqual([0, 0, 1, 1, 1, 1, 0])
    expect(week[5]).toEqual([h("10:00", "17:00")])
    expect(week[3]).toEqual([h("11:00", "19:00")])
  })

  it("reads split hours, wrapping day ranges, hours past midnight, 24:00 and 24/7", () => {
    expect(parseOpeningHours("Mo 10:00-14:00,16:00-20:00")![0]).toEqual([h("10:00", "14:00"), h("16:00", "20:00")])
    expect(parseOpeningHours("Fr-Mo 12:00-18:00")!.map((d) => d.length)).toEqual([1, 0, 0, 0, 1, 1, 1])
    expect(parseOpeningHours("Fr 18:00-02:00")![4]).toEqual([{ start: 18 * 60, end: 26 * 60 }])
    expect(parseOpeningHours("Sa 12:00-24:00")![5]).toEqual([{ start: 12 * 60, end: 24 * 60 }])
    expect(parseOpeningHours("24/7")!.every((d) => d[0].start === 0 && d[0].end === 1440)).toBe(true)
  })

  it("skips holiday rules, and holidays in a day list", () => {
    expect(parseOpeningHours("Mo-Su 11:00-20:00; PH off")!.every((d) => d.length === 1)).toBe(true)
    expect(parseOpeningHours("Tu-Sa 10:00-16:00; Su,Mo,PH off")!.map((d) => d.length)).toEqual([0, 1, 1, 1, 1, 1, 0])
  })

  it("reads rules separated by commas after a time", () => {
    const week = parseOpeningHours("Mo-Th 10:00-19:00, Fr-Sa 10:00-20:00, Su 12:00-18:00")!
    expect(week[0]).toEqual([h("10:00", "19:00")])
    expect(week[5]).toEqual([h("10:00", "20:00")])
    expect(week[6]).toEqual([h("12:00", "18:00")])
  })

  it.each(["Jan-Mar Mo 10:00-18:00", "Mo 10:00+", "Mo sunrise-sunset", 'Mo-Fr 10:00-18:00 "by appointment"', "By appointment only", "Mo 25:00-26:00", "", null])("can't read %s, so the text is shown as written", (text) => {
    expect(parseOpeningHours(text)).toBeNull()
  })

  it("tells when every day is the same, and today's index from Monday", () => {
    expect(sameEveryDay(parseOpeningHours("Mo-Su 11:00-19:00") as Week)).toBe(true)
    expect(sameEveryDay(parseOpeningHours("Mo-Sa 11:00-19:00") as Week)).toBe(false)
    expect(weekdayIndex(new Date(2026, 10, 9))).toBe(0) // a Monday
    expect(weekdayIndex(new Date(2026, 10, 15))).toBe(6) // a Sunday
  })
})
