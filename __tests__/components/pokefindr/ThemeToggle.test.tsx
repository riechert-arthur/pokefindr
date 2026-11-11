import { fireEvent, render, screen } from "../../helpers/intl"
import { describe, expect, it, vi } from "vitest"

const setTheme = vi.fn()
let state = { theme: "system", resolvedTheme: "light" }
vi.mock("next-themes", () => ({ useTheme: () => ({ ...state, setTheme }) }))

import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"

describe("ThemeToggle toggle variant (#355)", () => {
  it.each([
    ["system", "light", false, "dark"],
    ["system", "dark", true, "light"],
    ["light", "light", false, "dark"],
    ["dark", "dark", true, "light"],
  ])("with theme %s showing %s, is a Dark theme switch (on: %s) that flips to %s", (theme, resolvedTheme, on, next) => {
    state = { theme, resolvedTheme }
    setTheme.mockClear()
    render(<ThemeToggle variant="toggle" />)
    const sw = screen.getByRole("switch", { name: "Dark theme" })
    expect(sw).toHaveAttribute("aria-checked", String(on))
    fireEvent.click(sw)
    expect(setTheme).toHaveBeenCalledWith(next)
  })

  it("flips from its label too, which can be screen-reader only", () => {
    state = { theme: "light", resolvedTheme: "light" }
    setTheme.mockClear()
    render(<ThemeToggle variant="toggle" labelClassName="sr-only" />)
    const label = screen.getByText("Dark theme")
    expect(label).toHaveClass("sr-only")
    fireEvent.click(label)
    expect(setTheme).toHaveBeenCalledWith("dark")
  })
})
