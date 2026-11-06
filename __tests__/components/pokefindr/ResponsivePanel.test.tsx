import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import { renderToString } from "react-dom/server"
import { ResponsivePanel } from "@/components/pokefindr/ResponsivePanel"
import { resetMediaQueryCache } from "@/hooks/use-media-query"

/** A controllable viewport: `resize(desktop)` fires "change" on every query. */
function setViewport(desktop: boolean) {
  const listeners = new Set<() => void>()
  let matches = desktop
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return matches
    },
    media: query,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }))
  return {
    resize(next: boolean) {
      matches = next
      act(() => listeners.forEach((l) => l()))
    },
  }
}

describe("ResponsivePanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    resetMediaQueryCache()
  })

  it("is a side sheet on desktop", () => {
    setViewport(true)
    render(
      <ResponsivePanel open onOpenChange={() => {}} title="QFC" description="1401 Broadway">
        Details
      </ResponsivePanel>,
    )
    const dialog = screen.getByRole("dialog", { name: "QFC" })
    expect(dialog).toHaveClass("sm:max-w-md")
    expect(screen.getByText("Details")).toBeInTheDocument()
  })

  it("is a bottom drawer on phones", () => {
    setViewport(false)
    render(
      <ResponsivePanel open onOpenChange={() => {}} title="QFC">
        Details
      </ResponsivePanel>,
    )
    // useMediaQuery reads matchMedia on the first client render, so no Sheet mounts first.
    expect(screen.getAllByRole("dialog")).toHaveLength(1)
    const dialog = screen.getByRole("dialog", { name: "QFC" })
    expect(dialog).not.toHaveClass("sm:max-w-md")
    expect(dialog).toHaveAttribute("data-vaul-drawer-direction", "bottom")
  })

  it("keeps the same panel while open when the breakpoint changes", () => {
    const viewport = setViewport(true)
    const { rerender } = render(
      <ResponsivePanel open onOpenChange={() => {}} title="QFC">
        <input aria-label="Note" defaultValue="" />
      </ResponsivePanel>,
    )
    const note = screen.getByRole("textbox", { name: "Note" })
    ;(note as HTMLInputElement).value = "typed"
    viewport.resize(false)
    // Still the sheet, and the same input with its value.
    expect(screen.getByRole("dialog")).toHaveClass("sm:max-w-md")
    expect(screen.getByRole("textbox", { name: "Note" })).toBe(note)
    expect((note as HTMLInputElement).value).toBe("typed")

    // Once closed, it follows the viewport again.
    rerender(
      <ResponsivePanel open={false} onOpenChange={() => {}} title="QFC">
        <input aria-label="Note" defaultValue="" />
      </ResponsivePanel>,
    )
    rerender(
      <ResponsivePanel open onOpenChange={() => {}} title="QFC">
        <input aria-label="Note" defaultValue="" />
      </ResponsivePanel>,
    )
    expect(screen.getByRole("dialog")).toHaveAttribute("data-vaul-drawer-direction", "bottom")
  })

  it("opts out of aria-describedby without a description", () => {
    setViewport(true)
    render(
      <ResponsivePanel open onOpenChange={() => {}} title="QFC">
        Details
      </ResponsivePanel>,
    )
    expect(screen.getByRole("dialog")).not.toHaveAttribute("aria-describedby")
  })

  it("becomes a drawer after hydration when it's open on load on a phone", async () => {
    setViewport(false)
    const ui = (
      <ResponsivePanel open onOpenChange={() => {}} title="QFC">
        Details
      </ResponsivePanel>
    )
    // The server render assumes desktop; hydrating on a phone must not keep the Sheet.
    const container = document.createElement("div")
    container.innerHTML = renderToString(ui)
    document.body.appendChild(container)
    render(ui, { container, hydrate: true })
    await waitFor(() => expect(screen.getByRole("dialog")).toHaveAttribute("data-vaul-drawer-direction", "bottom"))
    container.remove()
  })
})
