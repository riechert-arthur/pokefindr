import { describe, expect, it } from "vitest"
import { moderateHref, tabFor, tabsFor } from "@/lib/moderate/tabs"

describe("/moderate tabs", () => {
  it("picks the tab asked for, else the queue", () => {
    expect(tabFor("reports")).toBe("reports")
    expect(tabFor("reviews")).toBe("reviews")
    expect(tabFor("jobs")).toBe("queue")
    expect(tabFor(["reports", "queue"])).toBe("queue")
    expect(tabFor(undefined)).toBe("queue")
  })

  it("links each tab, the queue without a parameter", () => {
    expect(moderateHref("queue")).toBe("/moderate")
    expect(moderateHref("reports")).toBe("/moderate?tab=reports")
    expect(moderateHref("reviews")).toBe("/moderate?tab=reviews")
  })

  it("shows each role the tabs it may open, held Reviews with moderation.reviews", () => {
    expect(tabsFor("moderator")).toEqual(["queue", "reviews", "reports"])
    expect(tabsFor("admin")).toEqual(["queue", "reviews", "reports"])
    expect(tabsFor("super_admin")).toEqual(["queue", "reviews", "reports"])
    expect(tabsFor("member")).toEqual([])
    expect(tabsFor(null)).toEqual([])
  })
})
