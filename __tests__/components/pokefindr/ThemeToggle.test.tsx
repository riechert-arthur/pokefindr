import { fireEvent, render, screen } from "../../helpers/intl"
import { describe, expect, it, vi } from "vitest"

const setTheme = vi.fn()
let state = { theme: "system", resolvedTheme: "light" }
vi.mock("next-themes", () => ({ useTheme: () => ({ ...state, setTheme }) }))

import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"

describe("ThemeToggle toggle variant", () => {
  it.each([
    ["system", "light", "dark"],
    ["system", "dark", "light"],
    ["light", "light", "dark"],
    ["dark", "dark", "light"],
  ])("with theme %s showing %s, switches to %s", (theme, resolvedTheme, next) => {
    state = { theme, resolvedTheme }
    setTheme.mockClear()
    render(<ThemeToggle variant="toggle" />)
    fireEvent.click(screen.getByRole("button", { name: `Switch to ${next} theme` }))
    expect(setTheme).toHaveBeenCalledWith(next)
  })

  it("shows the theme it switches to as its label, part of its name", () => {
    state = { theme: "light", resolvedTheme: "light" }
    render(<ThemeToggle variant="toggle" labelClassName="sr-only" />)
    const label = screen.getByText("Dark theme")
    expect(label).toHaveClass("sr-only")
    expect(screen.getByRole("button", { name: "Switch to dark theme" })).toContainElement(label)
  })
})
