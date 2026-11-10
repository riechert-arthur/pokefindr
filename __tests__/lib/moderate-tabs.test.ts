import { describe, expect, it } from "vitest"
import { moderateHref, tabFor } from "@/lib/moderate/tabs"

describe("/moderate tabs", () => {
  it("picks the tab asked for, else the queue", () => {
    expect(tabFor("reports")).toBe("reports")
    expect(tabFor("jobs")).toBe("queue")
    expect(tabFor(["reports", "queue"])).toBe("queue")
    expect(tabFor(undefined)).toBe("queue")
  })

  it("links each tab, the queue without a parameter", () => {
    expect(moderateHref("queue")).toBe("/moderate")
    expect(moderateHref("reports")).toBe("/moderate?tab=reports")
  })
})
