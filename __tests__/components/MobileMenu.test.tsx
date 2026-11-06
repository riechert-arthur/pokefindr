import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render } from "@testing-library/react"

vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: null }) }))

import { MobileMenu } from "@/components/ContentPageHeader"
import { resetMediaQueryCache } from "@/hooks/use-media-query"

describe("MobileMenu", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetMediaQueryCache()
  })

  it("closes itself when the window widens past lg", () => {
    const listeners = new Set<() => void>()
    let desktop = false
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return desktop
      },
      media: query,
      addEventListener: (_: string, l: () => void) => listeners.add(l),
      removeEventListener: (_: string, l: () => void) => listeners.delete(l),
    }))
    const setOpen = vi.fn()
    render(<MobileMenu mobileMenuOpen setMobileMenuOpen={setOpen} navigation={[{ name: "Map", href: "/map" }]} />)
    expect(setOpen).not.toHaveBeenCalled()

    desktop = true
    act(() => listeners.forEach((l) => l()))
    expect(setOpen).toHaveBeenCalledWith(false)
  })
})
