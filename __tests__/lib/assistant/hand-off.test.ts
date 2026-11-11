import { afterEach, describe, expect, it, vi } from "vitest"
import { handOff, hasHandOff, takeHandOff } from "@/lib/assistant/hand-off"

afterEach(() => {
  vi.useRealTimers()
  takeHandOff()
})

describe("hand-off (#391)", () => {
  it("gives the question to the first taker only", () => {
    handOff("machines in Seattle?")
    expect(hasHandOff()).toBe(true)
    expect(takeHandOff()).toBe("machines in Seattle?")
    expect(hasHandOff()).toBe(false)
    expect(takeHandOff()).toBeNull()
  })

  it("drops a question left behind, so it isn't asked later, unasked (#391 review)", () => {
    vi.useFakeTimers()
    handOff("machines in Seattle?")
    vi.advanceTimersByTime(30_000)
    expect(takeHandOff()).toBeNull()
  })
})
