import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, within } from "../helpers/intl"
import type { Role } from "@/lib/auth/roles"
import { SidebarProvider, useSidebar } from "@/components/providers/SidebarContextProvider"

vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => "/map", useRouter: () => ({ replace: () => {} }) }))
const auth = vi.hoisted(() => ({ session: null as { id: string; role: Role } | null }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: auth.session }), useOptionalSession: () => auth.session, useOptionalSessionLoading: () => false }))
vi.mock("@/components/pokefindr/ThemeToggle", () => ({ ThemeToggle: () => <button type="button">theme</button> }))

import { SidebarLayout } from "@/components/SidebarLayout"

function MenuButton() {
  const { toggleSidebar } = useSidebar()
  return (
    <button type="button" onClick={toggleSidebar}>
      menu
    </button>
  )
}

describe("SidebarLayout phone drawer", () => {
  it("moves focus into the drawer, closes on Escape, and returns focus to the menu button", () => {
    render(
      <SidebarProvider>
        <SidebarLayout>
          <MenuButton />
        </SidebarLayout>
      </SidebarProvider>,
    )
    const menu = screen.getByRole("button", { name: "menu" })
    menu.focus()
    act(() => menu.click())
    expect(document.activeElement?.getAttribute("aria-label")).toBe("PokeFindr home")
    act(() => {
      fireEvent.keyDown(window, { key: "Escape" })
    })
    expect(document.activeElement).toBe(menu)
  })
})

describe("SidebarLayout staff links", () => {
  const links = (nav: HTMLElement) => within(nav).getAllByRole("link").map((a) => [a.getAttribute("aria-label") ?? a.textContent, a.getAttribute("href")])
  const staffLinks = (role: Role | null) => {
    auth.session = role ? { id: "u1", role } : null
    const { unmount } = render(
      <SidebarProvider>
        <SidebarLayout>page</SidebarLayout>
      </SidebarProvider>,
    )
    const staff = (nav: HTMLElement) => links(nav).filter(([, href]) => href === "/moderate" || href === "/admin")
    const result = { rail: staff(screen.getByRole("navigation", { name: "App navigation" })), tabs: staff(screen.getByRole("navigation", { name: "Tabs" })) }
    unmount()
    auth.session = null
    return result
  }

  it("shows neither to visitors and members", () => {
    expect(staffLinks(null)).toEqual({ rail: [], tabs: [] })
    expect(staffLinks("member")).toEqual({ rail: [], tabs: [] })
  })

  it("shows moderators Moderate only", () => {
    expect(staffLinks("moderator")).toEqual({ rail: [["Moderate", "/moderate"]], tabs: [["Moderate", "/moderate"]] })
  })

  it("shows admins and super admins both", () => {
    const both = { rail: [["Moderate", "/moderate"], ["Admin", "/admin"]], tabs: [["Moderate", "/moderate"], ["Admin", "/admin"]] }
    expect(staffLinks("admin")).toEqual(both)
    expect(staffLinks("super_admin")).toEqual(both)
  })
})
