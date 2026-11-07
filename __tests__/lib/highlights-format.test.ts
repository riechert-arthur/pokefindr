import { describe, expect, it } from "vitest"
import { formatEventWhen } from "@/lib/highlights/format"

describe("formatEventWhen", () => {
  it("writes one day with its weekday, and spans as ranges", () => {
    expect(formatEventWhen("2026-12-06T18:00:00Z", null)).toBe("Sun, Dec 6")
    expect(formatEventWhen("2026-12-06T18:00:00Z", "2026-12-06T22:00:00Z")).toBe("Sun, Dec 6")
    expect(formatEventWhen("2026-12-19T18:00:00Z", "2026-12-21T18:00:00Z")).toBe("Dec 19–21")
    expect(formatEventWhen("2026-11-30T18:00:00Z", "2026-12-02T18:00:00Z")).toBe("Nov 30–Dec 2")
  })
})
