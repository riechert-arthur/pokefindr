import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render } from "../../helpers/intl"
import { ScrollArea } from "@/components/ui/scroll-area"

/** A ResizeObserver that fires once on observe, and fixed scroll and client heights. */
function setSizes({ scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(scrollHeight)
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(clientHeight)
}

const viewport = (container: HTMLElement) => container.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement

describe("ScrollArea", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(private cb: () => void) {}
        observe() {
          this.cb()
        }
        disconnect() {}
      },
    )
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it("isn't a tab stop when nothing overflows", () => {
    setSizes({ scrollHeight: 100, clientHeight: 100 })
    const { container } = render(<ScrollArea>Short</ScrollArea>)
    expect(viewport(container)).not.toHaveAttribute("tabindex")
  })

  it("is a tab stop while text-only content overflows", () => {
    setSizes({ scrollHeight: 500, clientHeight: 100 })
    const { container } = render(<ScrollArea>Long</ScrollArea>)
    expect(viewport(container)).toHaveAttribute("tabindex", "0")
  })

  it("isn't a tab stop when the overflowing content has its own controls", () => {
    setSizes({ scrollHeight: 500, clientHeight: 100 })
    const { container } = render(
      <ScrollArea>
        <button>Row</button>
      </ScrollArea>,
    )
    expect(viewport(container)).not.toHaveAttribute("tabindex")
  })

  it("follows an explicit focusable prop", () => {
    setSizes({ scrollHeight: 100, clientHeight: 100 })
    const { container, rerender } = render(<ScrollArea focusable>Short</ScrollArea>)
    expect(viewport(container)).toHaveAttribute("tabindex", "0")
    rerender(<ScrollArea focusable={false}>Short</ScrollArea>)
    expect(viewport(container)).not.toHaveAttribute("tabindex")
  })
})
