import { afterEach, describe, expect, it, vi } from "vitest"
import { act, message, render } from "../../helpers/intl"
import { GHOST_PROMPTS, TypingPlaceholder } from "@/components/assistant/TypingPlaceholder"

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
    expect(message()(`assistant.placeholder.prompts.${GHOST_PROMPTS[0]}`).startsWith(container.textContent!)).toBe(true)
  })

  it("is still text with reduced motion", () => {
    motion(true)
    const { container } = render(<TypingPlaceholder />)
    expect(container.textContent).toBe(message()("assistant.placeholder.still"))
  })

  it("types the examples in Spanish on a Spanish page", () => {
    motion(true)
    const { container } = render(<TypingPlaceholder />, { locale: "es" })
    expect(container.textContent).toBe("Pregunta por máquinas, tiendas o eventos…")
  })
})
