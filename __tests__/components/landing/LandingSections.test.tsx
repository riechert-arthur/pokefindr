import { describe, expect, it } from "vitest"
import { fireEvent, render, screen, within } from "@testing-library/react"
import { FaqSection, HowItWorks, LocationTypes } from "@/components/landing/LandingSections"
import { Footer } from "@/components/Footer"

describe("landing sections", () => {
  it("lists the three steps in order", () => {
    render(<HowItWorks />)
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Search your city", "See what's nearby", "Get directions"])
  })

  it("marks kinds with locations live, with their count, and the rest coming soon", () => {
    render(<LocationTypes counts={{ vending: 1457 }} />)
    const vending = screen.getByRole("heading", { name: "Vending machines · 1,457" }).closest("article")!
    expect(within(vending).getByText("Live")).toBeInTheDocument()
    const shops = screen.getByRole("heading", { name: "Card shops" }).closest("article")!
    expect(within(shops).getByText("Coming soon")).toBeInTheDocument()
  })

  it("opens the first question, one at a time, with links in the answers", () => {
    render(<FaqSection />)
    expect(screen.getByText(/An automated retail machine/)).toBeVisible()
    fireEvent.click(screen.getByRole("button", { name: "Are the vending machine locations verified?" }))
    expect(screen.getByRole("link", { name: "Pokémon Center website" })).toHaveAttribute("rel", "noopener noreferrer")
    expect(screen.queryByText(/An automated retail machine/)).not.toBeInTheDocument()
  })

  it("has a footer with the main links and the not-affiliated notice", () => {
    render(<Footer />)
    expect(within(screen.getByRole("navigation", { name: "Footer" })).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Map",
      "Blog",
      "Support",
      "Changelog",
      "Privacy policy",
      "Terms of service",
    ])
    expect(screen.getByText(/not affiliated with The Pokémon Company International/)).toBeInTheDocument()
  })
})
