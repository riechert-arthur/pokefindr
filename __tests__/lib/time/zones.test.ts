import { describe, expect, it } from "vitest"
import { STATE_ZONES, formatInZone, zoneName, zonedToIso } from "@/lib/time/zones"

describe("zonedToIso", () => {
  it("reads a typed time in the event's zone, whoever types it", () => {
    expect(zonedToIso("2026-11-15T18:00", STATE_ZONES.WA)).toBe("2026-11-16T02:00:00.000Z") // 6 PM Pacific (PST)
    expect(zonedToIso("2026-11-15T18:00", STATE_ZONES.NY)).toBe("2026-11-15T23:00:00.000Z")
    expect(zonedToIso("2026-07-04T18:00", STATE_ZONES.CO)).toBe("2026-07-05T00:00:00.000Z") // MDT
    expect(zonedToIso("2026-07-04T18:00", STATE_ZONES.AZ)).toBe("2026-07-05T01:00:00.000Z") // no DST
  })

  it("gets the days daylight saving starts and ends right", () => {
    expect(zonedToIso("2026-03-08T12:00", "America/Chicago")).toBe("2026-03-08T17:00:00.000Z") // CDT, the morning of the change
    expect(zonedToIso("2026-11-01T12:00", "America/Chicago")).toBe("2026-11-01T18:00:00.000Z") // CST again
  })

  it("gives nothing for an empty or bad value", () => {
    expect(zonedToIso("", STATE_ZONES.CO)).toBe("")
    expect(zonedToIso("next friday", STATE_ZONES.CO)).toBe("")
  })
})

describe("zone names and formatting", () => {
  it("names zones as people say them and shows times in the zone", () => {
    expect(zoneName(STATE_ZONES.CO)).toBe("Mountain Time")
    expect(formatInZone("2026-11-16T02:00:00.000Z", STATE_ZONES.WA)).toBe("Sun, Nov 15, 6:00 PM")
  })
})

describe("zoneName without longGeneric", () => {
  it("falls back to the long name when the browser rejects longGeneric", () => {
    const Real = Intl.DateTimeFormat
    const Fake = function (locale: string, opts: Intl.DateTimeFormatOptions) {
      if (opts?.timeZoneName === "longGeneric") throw new RangeError("Value longGeneric out of range")
      return new Real(locale, opts)
    } as unknown as typeof Intl.DateTimeFormat
    Intl.DateTimeFormat = Fake
    try {
      expect(zoneName(STATE_ZONES.CO, new Date("2026-01-15T12:00:00Z"))).toBe("Mountain Standard Time")
    } finally {
      Intl.DateTimeFormat = Real
    }
  })
})
