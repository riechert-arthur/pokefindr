import { describe, expect, it } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
import { OpenNavButton } from "@/components/pokefindr/OpenNavButton"
import { APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { SidebarProvider } from "@/components/providers/SidebarContextProvider"

describe("OpenNavButton", () => {
  it("is named in the page's language", () => {
    render(<SidebarProvider><OpenNavButton /></SidebarProvider>)
    expect(screen.getByRole("button", { name: "Open navigation" })).toBeInTheDocument()
    render(<SidebarProvider><OpenNavButton /></SidebarProvider>, { locale: "es" })
    expect(screen.getByRole("button", { name: "Abrir navegación" })).toBeInTheDocument()
  })

  it("opens the app's navigation and says so", () => {
    render(<SidebarProvider><OpenNavButton /></SidebarProvider>)
    const button = screen.getByRole("button", { name: "Open navigation" })
    expect(button).toHaveAttribute("aria-controls", APP_NAV_ID)
    expect(button).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(button)
    expect(button).toHaveAttribute("aria-expanded", "true")
  })
})
