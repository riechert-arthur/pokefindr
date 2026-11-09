import { describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen } from "../helpers/intl"
import { SidebarProvider, useSidebar } from "@/components/providers/SidebarContextProvider"

vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => "/map" }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: null }) }))
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
