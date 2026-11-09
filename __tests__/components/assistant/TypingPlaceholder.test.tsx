import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render } from "../../helpers/intl"
import { GHOST_PROMPTS, STILL_PLACEHOLDER, TypingPlaceholder } from "@/components/assistant/TypingPlaceholder"

const motion = (reduce: boolean) => vi.stubGlobal("matchMedia", (q: string) => ({ matches: reduce && q.includes("reduce"), addEventListener() {}, removeEventListener() {} }))

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("TypingPlaceholder", () => {
  it("types the examples out", () => {
    vi.useFakeTimers()
    motion(false)
    const { container } = render(<TypingPlaceholder />)
    for (let i = 0; i < 12; i++) act(() => vi.advanceTimersByTime(80))
    expect(container.textContent!.length).toBeGreaterThan(5)
    expect(GHOST_PROMPTS[0].startsWith(container.textContent!)).toBe(true)
  })

  it("is still text with reduced motion", () => {
    motion(true)
    const { container } = render(<TypingPlaceholder />)
    expect(container.textContent).toBe(STILL_PLACEHOLDER)
  })
})
