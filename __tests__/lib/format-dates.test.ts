import { describe, expect, it } from "vitest"
import { formatEventWhen, formatShortDate } from "@/lib/format/dates"

describe("formatEventWhen", () => {
  it("writes one day with its weekday, and spans as ranges", () => {
    expect(formatEventWhen("2026-12-06T18:00:00Z", null, "en")).toBe("Sun, Dec 6")
    expect(formatEventWhen("2026-12-06T18:00:00Z", "2026-12-06T22:00:00Z", "en")).toBe("Sun, Dec 6")
    expect(formatEventWhen("2026-12-19T18:00:00Z", "2026-12-21T18:00:00Z", "en")).toBe("Dec 19–21")
    expect(formatEventWhen("2026-11-30T18:00:00Z", "2026-12-02T18:00:00Z", "en")).toBe("Nov 30–Dec 2")
  })

  it("follows the language's order and names (#181)", () => {
    expect(formatEventWhen("2026-12-06T18:00:00Z", null, "es")).toBe("dom, 6 dic")
    expect(formatEventWhen("2026-12-19T18:00:00Z", "2026-12-21T18:00:00Z", "es")).toBe("19–21 dic")
    expect(formatEventWhen("2026-11-30T18:00:00Z", "2026-12-02T18:00:00Z", "es")).toBe("30 nov–2 dic")
    expect(formatEventWhen("2026-12-19T18:00:00Z", "2026-12-21T18:00:00Z", "en-GB")).toBe("19–21 Dec")
  })
})

describe("formatShortDate", () => {
  it("adds the year only for another year", () => {
    const now = new Date("2026-11-09T12:00:00Z")
    expect(formatShortDate("2026-03-04T12:00:00Z", "en", now)).toBe("Mar 4")
    expect(formatShortDate("2025-03-04T12:00:00Z", "en", now)).toBe("Mar 4, 2025")
    expect(formatShortDate("2026-03-04T12:00:00Z", "es", now)).toBe("4 mar")
  })
})
