import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor, within } from "../../helpers/intl"

let pathname = "/map"
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => pathname, useRouter: () => ({ replace: () => {} }) }))
const theme = vi.hoisted(() => ({ props: null as null | { onOpenChange?: (open: boolean) => void } }))
vi.mock("@/components/pokefindr/ThemeToggle", () => ({
  ThemeToggle: (props: { onOpenChange?: (open: boolean) => void }) => {
    theme.props = props
    return <button type="button">theme</button>
  },
}))

import { AppRail } from "@/components/pokefindr/AppRail"

afterEach(() => {
  // Here, not at the end of a test, so a failed assertion can't leave fake timers on for the next one.
  vi.useRealTimers()
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
    pathname = "/home/reviews"
    render(<AppRail />)
    expect(current()).toEqual(["Home"])
  })

  it("shows Settings only when signed in", () => {
    const { rerender } = render(<AppRail />)
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull()
    rerender(<AppRail signedIn />)
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy()
  })

  it("shows Moderate and Admin only when allowed, and marks Moderate on its page", () => {
    pathname = "/moderate"
    const { rerender } = render(<AppRail />)
    expect(screen.queryByRole("link", { name: "Moderate" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull()
    rerender(<AppRail canModerate />)
    expect(screen.getByRole("link", { name: "Moderate" })).toHaveAttribute("href", "/moderate")
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull()
    expect(current()).toEqual(["Moderate"])
    rerender(<AppRail canModerate isAdmin />)
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute("href", "/admin")
  })

  it("marks Discord as leaving the site: an arrow on the icon while collapsed, at the end of the row when expanded (#369)", () => {
    const { rerender } = render(<AppRail expanded={false} />)
    const arrow = (where: string) => screen.getByRole("link", { name: "Discord" }).querySelector(`[data-external="${where}"]`)
    // Collapsed on desktop: the corner arrow; the phone drawer shows the row's end arrow instead.
    expect(arrow("corner")).not.toHaveClass("hidden")
    expect(arrow("corner")).toHaveClass("max-sm:hidden")
    expect(arrow("end")).toHaveClass("sm:hidden")
    expect(arrow("end")).not.toHaveClass("max-sm:hidden")
    rerender(<AppRail expanded />)
    expect(arrow("corner")).toHaveClass("hidden")
    expect(arrow("end")).not.toHaveClass("sm:hidden")
    // Only Discord leaves the site.
    expect(screen.getByRole("link", { name: "Map" }).querySelector("[data-external]")).toBeNull()
  })

  it("opens Discord in a new tab without an opener", () => {
    render(<AppRail />)
    const discord = screen.getByRole("link", { name: "Discord" })
    expect(discord.getAttribute("target")).toBe("_blank")
    expect(discord.getAttribute("rel")).toBe("noopener noreferrer")
  })

  it("keeps the language badge, and grows it to the rail's width with the language's name when expanded (#356)", () => {
    const { rerender } = render(<AppRail expanded={false} />)
    const badge = () => screen.getByRole("combobox", { name: "Language: English" })
    expect(screen.getByText("en")).not.toHaveClass("hidden")
    expect(screen.getByText("en")).toHaveClass("max-sm:hidden")
    expect(screen.getByText("English")).toHaveClass("sm:hidden")
    // Collapsed: 44px, arrow hidden on desktop; the phone drawer is always full width.
    expect(badge()).toHaveClass("w-11", "-mx-0.5", "px-1", "sm:[&>svg:last-child]:hidden", "max-sm:w-[calc(100%+4px)]")
    rerender(<AppRail expanded />)
    expect(badge()).toHaveClass("w-[calc(100%+4px)]", "border", "-mx-0.5", "px-1")
    expect(badge()).not.toHaveClass("sm:[&>svg:last-child]:hidden")
    expect(screen.getByText("en")).toHaveClass("hidden")
    expect(screen.getByText("English")).not.toHaveClass("sm:hidden")
  })

  it("stays expanded while the theme list is open (#355)", async () => {
    render(<AppRail />)
    const nav = screen.getByRole("navigation", { name: "App navigation" })
    expect(nav).not.toHaveAttribute("data-expanded")
    act(() => theme.props?.onOpenChange?.(true))
    await waitFor(() => expect(nav).toHaveAttribute("data-expanded"))
    act(() => theme.props?.onOpenChange?.(false))
    await waitFor(() => expect(nav).not.toHaveAttribute("data-expanded"))
  })

  it("links the assistant's conversation as Chat, after Home, current on /chat (#391)", () => {
    pathname = "/chat"
    render(<AppRail />)
    const names = screen.getAllByRole("link").map((a) => a.textContent)
    expect(names.indexOf("Chat")).toBe(names.indexOf("Home") + 1)
    expect(screen.getByRole("link", { name: "Chat" })).toHaveAttribute("href", "/chat")
    expect(current()).toEqual(["Chat"])
  })

  it("keeps Blog out of the dashboard's pages, with the links at the bottom (#387)", () => {
    render(<AppRail signedIn />)
    const settings = screen.getByRole("link", { name: "Settings" })
    const bottom = settings.closest(".mt-auto") as HTMLElement
    expect(within(bottom).getAllByRole("link").map((a) => a.textContent)).toEqual(["Blog", "Discord", "Settings"])
  })

  it("names each link by its label, without aria-label or title", () => {
    render(<AppRail signedIn isAdmin />)
    for (const name of ["Home", "Chat", "Blog", "Map", "Admin", "Discord", "Settings"]) {
      const link = screen.getByRole("link", { name })
      expect(link).not.toHaveAttribute("aria-label")
      expect(link).not.toHaveAttribute("title")
    }
  })
})

/** A window from sm up, or (`phone`) below it, where the rail is the drawer. */
const screenSize = (size: "desktop" | "phone") =>
  vi.stubGlobal("matchMedia", (query: string) => ({ matches: size === "desktop" && /min-width: 640px/.test(query), media: query, addEventListener() {}, removeEventListener() {} }))
const desktop = () => screenSize("desktop")

describe("AppRail expanding", () => {
  const nav = () => screen.getByRole("navigation", { name: "App navigation" })
  /** The pointer coming in from (or going out to) the page; React builds enter and leave from over and out. */
  const pointer = (type: "pointerover" | "pointerout", pointerType: string, target: Element = nav(), relatedTarget: Element | null = document.body) => {
    const event = new MouseEvent(type, { bubbles: true, relatedTarget })
    Object.defineProperty(event, "pointerType", { value: pointerType })
    act(() => {
      target.dispatchEvent(event)
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
    screenSize("phone")
    render(<AppRail />)
    const map = screen.getByRole("link", { name: "Map" })
    tabTo(map)
    // Expanded, so it's the drawer check that lets Escape through, not the collapsed one.
    await waitFor(() => expect(nav()).toHaveAttribute("data-expanded"))
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
  })

  it("expands for a mouse even when the device's main pointer is touch", () => {
    // A tablet with a mouse: "(hover: hover) and (pointer: fine)" doesn't match.
    desktop()
    vi.useFakeTimers()
    render(<AppRail />)
    pointer("pointerover", "mouse")
    act(() => vi.advanceTimersByTime(200))
    expect(nav()).toHaveAttribute("data-expanded")
  })

  it("collapses when the pointer turns out to be outside without a pointerleave", () => {
    // As when the language list unmounts under the pointer: React sends no leave.
    desktop()
    vi.useFakeTimers()
    render(
      <>
        <AppRail />
        <main>page</main>
      </>,
    )
    pointer("pointerover", "mouse")
    act(() => vi.advanceTimersByTime(200))
    expect(nav()).toHaveAttribute("data-expanded")
    pointer("pointerover", "mouse", screen.getByRole("main"), null)
    act(() => vi.advanceTimersByTime(300))
    expect(nav()).not.toHaveAttribute("data-expanded")
  })

  it("cancels a pending hover open on Escape", () => {
    desktop()
    vi.useFakeTimers()
    render(<AppRail />)
    pointer("pointerover", "mouse")
    act(() => vi.advanceTimersByTime(100))
    const onWindow = vi.fn()
    window.addEventListener("keydown", onWindow)
    fireEvent.keyDown(screen.getByRole("link", { name: "Map" }), { key: "Escape" })
    window.removeEventListener("keydown", onWindow)
    act(() => vi.advanceTimersByTime(500))
    expect(nav()).not.toHaveAttribute("data-expanded")
    expect(onWindow).not.toHaveBeenCalled()
  })

  it("brings the labels back when you tab on after Escape", async () => {
    desktop()
    render(<AppRail />)
    const map = screen.getByRole("link", { name: "Map" })
    tabTo(map)
    await waitFor(() => expect(nav()).toHaveAttribute("data-expanded"))
    fireEvent.keyDown(map, { key: "Escape" })
    await waitFor(() => expect(nav()).not.toHaveAttribute("data-expanded"))
    tabTo(screen.getByRole("link", { name: "Discord" }))
    await waitFor(() => expect(nav()).toHaveAttribute("data-expanded"))
  })

  it("collapses after following a link with the keyboard, though focus stays on it", async () => {
    desktop()
    const { rerender } = render(<AppRail />)
    const home = screen.getByRole("link", { name: "Home" })
    tabTo(home)
    await waitFor(() => expect(nav()).toHaveAttribute("data-expanded"))
    pathname = "/home"
    rerender(<AppRail />)
    await waitFor(() => expect(nav()).not.toHaveAttribute("data-expanded"))
    expect(home).toHaveFocus()
  })
})
