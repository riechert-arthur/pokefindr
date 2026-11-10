import { describe, expect, it } from "vitest"
import { ADMIN_SECTIONS, groupsFor, sectionFor } from "@/lib/admin/sections"
import { queueIsLate } from "@/lib/admin/summary"

describe("admin sections", () => {
  it("shows moderators only what they may open, admins everything", () => {
    expect(groupsFor("admin").flatMap((g) => g.sections)).toEqual(ADMIN_SECTIONS)
    expect(groupsFor("moderator").flatMap((g) => g.sections).map((s) => s.id)).toEqual(["queue", "reviews", "reports"])
    expect(groupsFor("member")).toEqual([])
    expect(groupsFor(null)).toEqual([])
  })

  it("opens the section asked for, else the first one allowed", () => {
    expect(sectionFor("queue", "moderator")?.id).toBe("queue")
    expect(sectionFor("nope", "admin")?.id).toBe("queue")
    expect(sectionFor(null, "admin")?.id).toBe("queue")
    expect(sectionFor("queue", "member")).toBeNull()
  })

  it("calls the queue late once its oldest submission waited over 24 h", () => {
    const now = Date.parse("2026-11-10T12:00:00Z")
    expect(queueIsLate({ count: 1, oldestAt: "2026-11-09T11:59:00Z" }, now)).toBe(true)
    expect(queueIsLate({ count: 1, oldestAt: "2026-11-09T12:01:00Z" }, now)).toBe(false)
    expect(queueIsLate({ count: 0, oldestAt: null }, now)).toBe(false)
  })
})
