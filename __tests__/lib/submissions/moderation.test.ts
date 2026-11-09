import { describe, expect, it } from "vitest"
import { UNDO_MS, canUndo } from "@/lib/submissions/moderation"

describe("canUndo", () => {
  it("allows an undo for an hour after the decision", () => {
    const now = Date.parse("2026-11-09T12:00:00Z")
    expect(canUndo(new Date(now - UNDO_MS + 1000).toISOString(), now)).toBe(true)
    expect(canUndo(new Date(now - UNDO_MS - 1000).toISOString(), now)).toBe(false)
    expect(canUndo(null, now)).toBe(false)
  })
})
