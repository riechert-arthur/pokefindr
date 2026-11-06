import React from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { ResponsivePanel } from "@/components/pokefindr/ResponsivePanel"

function setViewport(desktop: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: desktop,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

describe("ResponsivePanel", () => {
  afterEach(() => vi.unstubAllGlobals())

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
    const dialog = screen.getByRole("dialog", { name: "QFC" })
    expect(dialog).not.toHaveClass("sm:max-w-md")
    expect(dialog).toHaveAttribute("data-vaul-drawer-direction", "bottom")
  })
})
