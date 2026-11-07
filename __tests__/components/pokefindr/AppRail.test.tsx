import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

let pathname = "/map"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))
vi.mock("@/components/pokefindr/ThemeToggle", () => ({ ThemeToggle: () => <button type="button">theme</button> }))

import { AppRail } from "@/components/pokefindr/AppRail"

afterEach(() => {
  pathname = "/map"
})

const current = () => screen.getAllByRole("link").filter((a) => a.getAttribute("aria-current") === "page").map((a) => a.getAttribute("aria-label"))

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
})
