import { describe, it, expect } from "vitest"
import { safeNextPath } from "@/lib/redirects"

describe("safeNextPath", () => {
  it.each([
    ["/login", "/login"],
    ["/map?x=1", "/map?x=1"],
    [null, "/"],
    ["", "/"],
    ["https://evil.example", "/"],
    ["//evil.example", "/"],
    ["/\\evil.example", "/"],
    ["javascript:alert(1)", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNextPath(input)).toBe(expected)
  })
})
