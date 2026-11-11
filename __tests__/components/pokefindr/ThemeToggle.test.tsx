import { fireEvent, render, screen } from "../../helpers/intl"
import { describe, expect, it, vi } from "vitest"

const setTheme = vi.fn()
let state = { theme: "system", resolvedTheme: "light" }
vi.mock("next-themes", () => ({ useTheme: () => ({ ...state, setTheme }) }))

import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"

describe("ThemeToggle compact variant (#355)", () => {
  it.each([
    ["light", "Light"],
    ["dark", "Dark"],
    ["system", "System"],
  ])("shows the chosen theme (%s) by name", (theme, name) => {
    state = { theme, resolvedTheme: theme === "dark" ? "dark" : "light" }
    render(<ThemeToggle variant="compact" labelClassName="sm:sr-only" />)
    expect(screen.getByRole("combobox", { name: "Theme" })).toHaveTextContent(name)
    expect(screen.getByText(name)).toHaveClass("sm:sr-only")
  })

  it("offers Light, Dark and System, and picks one", () => {
    state = { theme: "light", resolvedTheme: "light" }
    setTheme.mockClear()
    render(<ThemeToggle variant="compact" />)
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Theme" }), { key: "Enter" })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Light", "Dark", "System"])
    fireEvent.click(screen.getByRole("option", { name: "Dark" }))
    expect(setTheme).toHaveBeenCalledWith("dark")
  })
})
