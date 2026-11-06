import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import { Logo } from "@/components/brand/Logo"

describe("Logo", () => {
  it("has an accessible name by default", () => {
    render(<Logo />)
    expect(screen.getByRole("img", { name: "PokeFindr" })).toBeTruthy()
  })

  it("is decorative when title is empty", () => {
    const { container } = render(<Logo title="" />)
    expect(screen.queryByRole("img")).toBeNull()
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true")
  })

  it("renders the wordmark in the full variant", () => {
    const { container } = render(<Logo variant="full" />)
    expect(container.textContent).toBe("PokeFindr")
    expect(screen.getByRole("img", { name: "PokeFindr" })).toBeTruthy()
  })

  it("gives each instance its own gradient id", () => {
    const { container } = render(
      <>
        <Logo />
        <Logo />
      </>,
    )
    const ids = [...container.querySelectorAll("linearGradient")].map((g) => g.id)
    expect(new Set(ids).size).toBe(2)
  })

  it("colors the pin from the brand tokens", () => {
    const { container } = render(<Logo />)
    const stops = [...container.querySelectorAll("stop")].map((s) => s.getAttribute("style"))
    expect(stops.join(" ")).toContain("--brand")
    expect(stops.join(" ")).toContain("--brand-2")
  })
})
