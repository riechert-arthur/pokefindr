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
    ["holo-light", "Holo Light"],
    ["holo-dark", "Holo Dark"],
    ["system", "System"],
  ])("shows the chosen theme (%s) by name", (theme, name) => {
    state = { theme, resolvedTheme: theme === "dark" ? "dark" : "light" }
    render(<ThemeToggle variant="compact" labelClassName="sm:sr-only" />)
    expect(screen.getByRole("combobox", { name: `Theme: ${name}` })).toHaveTextContent(name)
    expect(screen.getByText(name)).toHaveClass("sm:sr-only")
  })

  it("offers Light, Dark, Holo Light, Holo Dark and System, and picks one (#371)", () => {
    state = { theme: "light", resolvedTheme: "light" }
    setTheme.mockClear()
    render(<ThemeToggle variant="compact" />)
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Theme: Light" }), { key: "Enter" })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Light", "Dark", "Holo Light", "Holo Dark", "System"])
    fireEvent.click(screen.getByRole("option", { name: "Holo Dark" }))
    expect(setTheme).toHaveBeenCalledWith("holo-dark")
  })
})
