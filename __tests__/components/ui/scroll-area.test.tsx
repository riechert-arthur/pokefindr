import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { render } from "@testing-library/react"
import { ScrollArea } from "@/components/ui/scroll-area"

describe("ScrollArea", () => {
  afterEach(() => vi.unstubAllGlobals())

  const viewport = (container: HTMLElement) => container.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement

  it("isn't a tab stop when nothing overflows", () => {
    const { container } = render(<ScrollArea>Short</ScrollArea>)
    expect(viewport(container)).not.toHaveAttribute("tabindex")
  })

  it("is a tab stop while its content overflows", () => {
    vi.stubGlobal("ResizeObserver", class {
      constructor(private cb: () => void) {}
      observe() { this.cb() }
      disconnect() {}
    })
    vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(500)
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(100)
    const { container } = render(<ScrollArea>Long</ScrollArea>)
    expect(viewport(container)).toHaveAttribute("tabindex", "0")
    vi.restoreAllMocks()
  })

  it("follows an explicit focusable prop", () => {
    const { container, rerender } = render(<ScrollArea focusable>Short</ScrollArea>)
    expect(viewport(container)).toHaveAttribute("tabindex", "0")
    rerender(<ScrollArea focusable={false}>Short</ScrollArea>)
    expect(viewport(container)).not.toHaveAttribute("tabindex")
  })
})
