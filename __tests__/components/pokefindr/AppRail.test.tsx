import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "../../helpers/intl"

let pathname = "/map"
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => pathname, useRouter: () => ({ replace: () => {} }) }))
vi.mock("@/components/pokefindr/ThemeToggle", () => ({ ThemeToggle: () => <button type="button">theme</button> }))

import { AppRail } from "@/components/pokefindr/AppRail"

afterEach(() => {
  pathname = "/map"
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const current = () => screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.textContent)

describe("AppRail", () => {
  it("marks the current page, including its sub-pages", () => {
    render(<AppRail />)
    expect(current()).toEqual(["Map"])
  })

  it("doesn't match a page that only shares a prefix", () => {
    pathname = "/mapper"
    render(<AppRail />)
    expect(current()).toEqual([])
  })

  it("marks nested routes", () => {
    pathname = "/blog/some-post"
    render(<AppRail />)
    expect(current()).toEqual(["Blog"])
  })

  it("shows Settings only when signed in", () => {
    const { rerender } = render(<AppRail />)
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull()
    rerender(<AppRail signedIn />)
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy()
  })

  it("opens Discord in a new tab without an opener", () => {
    render(<AppRail />)
    const discord = screen.getByRole("link", { name: "Discord" })
    expect(discord.getAttribute("target")).toBe("_blank")
    expect(discord.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("names each link by its label, without aria-label or title", () => {
    render(<AppRail signedIn isAdmin />)
    for (const name of ["Home", "Blog", "Map", "Admin", "Discord", "Settings"]) {
      const link = screen.getByRole("link", { name })
      expect(link).not.toHaveAttribute("aria-label")
      expect(link).not.toHaveAttribute("title")
    }
  })
})

/** A desktop with a mouse: from sm up, and hover works. */
const desktop = () =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: /min-width: 640px|hover: hover/.test(query), media: query, addEventListener() {}, removeEventListener() {} }))

describe("AppRail expanding", () => {
  const nav = () => screen.getByRole("navigation", { name: "App navigation" })
  /** The pointer coming in from (or going out to) the page; React builds enter and leave from over and out. */
  const pointer = (type: "pointerover" | "pointerout", pointerType: string) => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget: document.body })
    Object.defineProperty(event, "pointerType", { value: pointerType })
    act(() => {
      nav().dispatchEvent(event)
    })
  }
  /** Keyboard focus: jsdom has no :focus-visible heuristics, so say it matches. */
  const tabTo = (el: HTMLElement) => {
    vi.spyOn(el, "matches").mockImplementation((s: string) => s === ":focus-visible" || Element.prototype.matches.call(el, s))
    act(() => el.focus())
  }

  it("expands when keyboard focus comes in, and collapses when it leaves", async () => {
    desktop()
    render(
      <>
        <AppRail />
        <button type="button">outside</button>
      </>,
    )
    expect(nav()).not.toHaveAttribute("data-expanded")
    // Collapsed, the label is visually hidden from sm up but still names the link.
    expect(screen.getByText("Map")).toHaveClass("sm:sr-only")
    tabTo(screen.getByRole("link", { name: "Map" }))
    await waitFor(() => expect(nav()).toHaveAttribute("data-expanded"))
    expect(screen.getByText("Map")).not.toHaveClass("sm:sr-only")
    act(() => screen.getByRole("button", { name: "outside" }).focus())
    await waitFor(() => expect(nav()).not.toHaveAttribute("data-expanded"))
  })

  it("doesn't expand on focus from a click or tap", async () => {
    desktop()
    render(<AppRail />)
    const map = screen.getByRole("link", { name: "Map" })
    vi.spyOn(map, "matches").mockImplementation((s: string) => s !== ":focus-visible" && Element.prototype.matches.call(map, s))
    act(() => map.focus())
    await act(() => new Promise((r) => setTimeout(r, 50)))
    expect(nav()).not.toHaveAttribute("data-expanded")
  })

  it("collapses on Escape and keeps focus where it is", async () => {
    desktop()
    render(<AppRail />)
    const map = screen.getByRole("link", { name: "Map" })
    tabTo(map)
    await waitFor(() => expect(nav()).toHaveAttribute("data-expanded"))
    const onWindow = vi.fn()
    window.addEventListener("keydown", onWindow)
    fireEvent.keyDown(map, { key: "Escape" })
    window.removeEventListener("keydown", onWindow)
    await waitFor(() => expect(nav()).not.toHaveAttribute("data-expanded"))
    expect(map).toHaveFocus()
    // Handled here, so it doesn't also reach the phone drawer's handler.
    expect(onWindow).not.toHaveBeenCalled()
  })

  it("leaves Escape to the phone drawer below sm", async () => {
    render(<AppRail />)
    const map = screen.getByRole("link", { name: "Map" })
    tabTo(map)
    const onWindow = vi.fn()
    window.addEventListener("keydown", onWindow)
    fireEvent.keyDown(map, { key: "Escape" })
    window.removeEventListener("keydown", onWindow)
    expect(onWindow).toHaveBeenCalled()
  })

  it("expands on mouse hover after a short delay, not on touch", async () => {
    desktop()
    vi.useFakeTimers()
    render(<AppRail />)
    pointer("pointerover", "touch")
    act(() => vi.advanceTimersByTime(500))
    expect(nav()).not.toHaveAttribute("data-expanded")
    pointer("pointerover", "mouse")
    act(() => vi.advanceTimersByTime(100))
    expect(nav()).not.toHaveAttribute("data-expanded")
    act(() => vi.advanceTimersByTime(100))
    expect(nav()).toHaveAttribute("data-expanded")
    pointer("pointerout", "mouse")
    act(() => vi.advanceTimersByTime(200))
    expect(nav()).toHaveAttribute("data-expanded")
    act(() => vi.advanceTimersByTime(100))
    expect(nav()).not.toHaveAttribute("data-expanded")
    vi.useRealTimers()
  })
})
