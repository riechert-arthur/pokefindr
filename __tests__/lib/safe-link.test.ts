import { describe, expect, it } from "vitest"
import { safeHref } from "@/lib/assistant/safe-link"

describe("safeHref", () => {
  it("allows our own paths and Google Maps directions", () => {
    expect(safeHref("/map?location=abc")).toBe("/map?location=abc")
    expect(safeHref("https://www.google.com/maps/dir/?api=1&origin=1,2&destination=3,4")).toContain("https://www.google.com/maps/dir/")
  })

  it("refuses scripts, other sites and protocol-relative paths", () => {
    for (const href of ["javascript:alert(1)", "JAVASCRIPT:alert(1)", "data:text/html,hi", "https://evil.example/maps/dir/", "http://www.google.com/maps/dir/", "https://www.google.com.evil.example/maps/dir/", "//evil.example", "/\\evil.example", "https://www.google.com/search?q=x", "", null])
      expect(safeHref(href)).toBeNull()
  })
})
