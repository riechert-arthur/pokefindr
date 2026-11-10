import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "../../helpers/intl"

let pathname = "/map"
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => pathname, useRouter: () => ({ replace: () => {} }) }))
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

  it("opens Discord in a new tab without an opener", () => {
    render(<AppRail />)
    const discord = screen.getByRole("link", { name: "Discord" })
    expect(discord.getAttribute("target")).toBe("_blank")
    expect(discord.getAttribute("rel")).toBe("noopener noreferrer")
  })
})
