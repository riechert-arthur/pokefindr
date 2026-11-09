/**
 * Each US state's main time zone, for reading an event's typed time as the
 * event's local time. States split across zones (Texas, Florida, Kentucky,
 * Tennessee, Indiana, Michigan, the Dakotas, Nebraska, Kansas, Oregon, Idaho)
 * use the zone most of their people are in.
 */
export const STATE_ZONES: Record<string, string> = {
  AL: "America/Chicago", AK: "America/Anchorage", AZ: "America/Phoenix", AR: "America/Chicago", CA: "America/Los_Angeles",
  CO: "America/Denver", CT: "America/New_York", DE: "America/New_York", DC: "America/New_York", FL: "America/New_York",
  GA: "America/New_York", HI: "Pacific/Honolulu", ID: "America/Boise", IL: "America/Chicago", IN: "America/Indiana/Indianapolis",
  IA: "America/Chicago", KS: "America/Chicago", KY: "America/New_York", LA: "America/Chicago", ME: "America/New_York",
  MD: "America/New_York", MA: "America/New_York", MI: "America/Detroit", MN: "America/Chicago", MS: "America/Chicago",
  MO: "America/Chicago", MT: "America/Denver", NE: "America/Chicago", NV: "America/Los_Angeles", NH: "America/New_York",
  NJ: "America/New_York", NM: "America/Denver", NY: "America/New_York", NC: "America/New_York", ND: "America/Chicago",
  OH: "America/New_York", OK: "America/Chicago", OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York",
  SC: "America/New_York", SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VT: "America/New_York", VA: "America/New_York", WA: "America/Los_Angeles", WV: "America/New_York", WI: "America/Chicago",
  WY: "America/Denver", PR: "America/Puerto_Rico",
}

/** The viewer's own zone, e.g. "America/Denver". */
export const browserZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone

/** How far the zone is ahead of UTC at that instant, in ms (negative in the Americas). */
function offsetAt(zone: string, at: number): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(new Date(at))
      .map((p) => [p.type, p.value]),
  )
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second)
  return asUtc - Math.floor(at / 1000) * 1000
}

/**
 * A wall-clock time ("2026-11-15T18:00", as a datetime-local input gives it)
 * in `zone`, as an ISO instant. Empty for an empty or malformed value.
 */
export function zonedToIso(local: string, zone: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(local)
  if (!m) return ""
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5])
  // Guess with the offset at the wall time, then correct once for a DST change between the two.
  let at = wall - offsetAt(zone, wall)
  at = wall - offsetAt(zone, at)
  return new Date(at).toISOString()
}

/**
 * "Mountain Time", "Hawaii-Aleutian Time": the zone's name for people.
 * Browsers without "longGeneric" (Safari before 15.4) throw on it; they get
 * the long name ("Mountain Standard Time"), then the zone id.
 */
export function zoneName(zone: string, at = new Date()): string {
  for (const style of ["longGeneric", "long"] as const) {
    try {
      const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: style }).formatToParts(at).find((p) => p.type === "timeZoneName")
      if (part) return part.value
    } catch {
      // Not supported here: try the next style.
    }
  }
  return zone
}

/** "Sat, Nov 15, 6:00 PM" in `zone`. */
export const formatInZone = (iso: string, zone: string) =>
  new Date(iso).toLocaleString("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
