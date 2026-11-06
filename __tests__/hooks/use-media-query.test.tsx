import { afterEach, describe, expect, it, vi } from "vitest"
import { act, renderHook } from "@testing-library/react"
import { resetMediaQueryCache, useMediaQuery } from "@/hooks/use-media-query"
import { SCREENS } from "@/lib/design/breakpoints"
import tailwindConfig from "../../tailwind.config"

afterEach(() => {
  vi.unstubAllGlobals()
  resetMediaQueryCache()
})

describe("useMediaQuery", () => {
  it("falls back to addListener on browsers without MediaQueryList.addEventListener", () => {
    let listener: (() => void) | undefined
    let matches = false
    vi.stubGlobal("matchMedia", () => ({
      get matches() {
        return matches
      },
      addListener: (l: () => void) => (listener = l),
      removeListener: vi.fn(),
    }))
    const { result } = renderHook(() => useMediaQuery("(min-width: 768px)"))
    expect(result.current).toBe(false)
    matches = true
    act(() => listener?.())
    expect(result.current).toBe(true)
  })

  it("parses each query once", () => {
    const matchMedia = vi.fn(() => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }))
    vi.stubGlobal("matchMedia", matchMedia)
    const { rerender } = renderHook(() => useMediaQuery("(min-width: 1024px)"))
    rerender()
    rerender()
    expect(matchMedia).toHaveBeenCalledTimes(1)
  })

  it("uses the same breakpoints as Tailwind", () => {
    expect(tailwindConfig.theme?.screens).toEqual(SCREENS)
  })
})
