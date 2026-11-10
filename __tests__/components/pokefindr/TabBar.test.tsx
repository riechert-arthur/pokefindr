import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "../../helpers/intl"
import { TabBar } from "@/components/pokefindr/TabBar"

const nav = vi.hoisted(() => ({ pathname: "/home" }))
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => nav.pathname }))

afterEach(() => {
  nav.pathname = "/home"
})

describe("TabBar", () => {
  it("links Home and Map and marks the current tab", () => {
    nav.pathname = "/home/reviews"
    render(<TabBar />)
    const tabs = screen.getAllByRole("link")
    expect(tabs.map((t) => [t.textContent, t.getAttribute("href"), t.getAttribute("aria-current")])).toEqual([
      ["Home", "/home", "page"],
      ["Map", "/map", null],
    ])
  })

  it("adds Add a place and Admin when they're available", () => {
    nav.pathname = "/map"
    render(<TabBar canAdd isAdmin />)
    expect(screen.getAllByRole("link").map((t) => t.textContent)).toEqual(["Home", "Map", "Add a place", "Admin"])
    expect(screen.getByRole("link", { name: "Map" })).toHaveAttribute("aria-current", "page")
  })

  it("lifts toasts above it while it's shown", () => {
    const { unmount } = render(<TabBar />)
    expect(document.documentElement).toHaveClass("has-tabbar")
    unmount()
    expect(document.documentElement).not.toHaveClass("has-tabbar")
  })
})
