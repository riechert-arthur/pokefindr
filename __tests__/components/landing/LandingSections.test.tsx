import { describe, expect, it, vi } from "vitest"
import { fireEvent, message, render, screen, within } from "../../helpers/intl"
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), useRouter: () => ({ push: vi.fn() }) }))

import { FaqSection, HowItWorks, LocationTypes } from "@/components/landing/LandingSections"
import { Footer } from "@/components/Footer"
import { FAQ_IDS } from "@/lib/faq"
import { Hero } from "@/components/landing/Hero"

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
    expect(screen.getByText(/An automated retail machine/).closest("[data-state]")).toHaveAttribute("data-state", "closed")
  })

  it("puts every answer in the HTML, closed ones hidden", () => {
    const { container } = render(<FaqSection />)
    const answers = [...container.querySelectorAll("h3 + [data-state]")]
    expect(answers).toHaveLength(FAQ_IDS.length)
    for (const a of answers) expect(a.textContent?.trim()).not.toBe("")
    expect(answers.filter((a) => a.getAttribute("data-state") === "closed" && a.classList.contains("data-[state=closed]:hidden"))).toHaveLength(FAQ_IDS.length - 1)
  })

  it("has a footer with the main links and the not-affiliated notice", () => {
    render(<Footer />)
    expect(within(screen.getByRole("navigation", { name: "Footer" })).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Map",
      "Blog",
      "Support",
      "Changelog",
      "Developers",
      "Privacy policy",
      "Terms of service",
    ])
    expect(screen.getByText(/not affiliated with The Pokémon Company International/)).toBeInTheDocument()
  })

  it("links the FAQ's support answers to Discord", () => {
    render(<FaqSection />)
    fireEvent.click(screen.getByRole("button", { name: message()("faq.items.report.question") }))
    expect(screen.getAllByRole("link", { name: "Support" }).map((a) => a.getAttribute("href"))).toContain("https://discord.gg/f2uUR5bAZU")
  })

  it("renders the landing page in Spanish", () => {
    render(
      <>
        <Hero stats={{ vending: 1457, states: 1 }} />
        <HowItWorks />
        <FaqSection />
      </>,
      { locale: "es" },
    )
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Encuentra máquinas expendedoras de Pokémon cerca de ti")
    // Spanish numbers, and the state count's plural.
    expect(screen.getByText("1457")).toBeInTheDocument()
    expect(screen.getByText("estado")).toBeInTheDocument()
    expect(screen.getByPlaceholderText("Ciudad o dirección, como Denver, CO")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Usar mi ubicación" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "Busca tu ciudad" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "¿Qué es una máquina expendedora de Pokémon?" })).toBeInTheDocument()
    for (const a of screen.getAllByRole("link", { name: "Soporte" })) expect(a).toHaveAttribute("href", "https://discord.gg/f2uUR5bAZU")
  })

  it("pluralizes the hero's state count", () => {
    render(<Hero stats={{ vending: 1457, states: 12 }} />)
    expect(screen.getByText("1,457")).toBeInTheDocument()
    expect(screen.getByText("states")).toBeInTheDocument()
  })

  it("has a footer in Spanish", () => {
    render(<Footer />, { locale: "es" })
    const links = within(screen.getByRole("navigation", { name: message("es")("content.footer.navLabel") })).getAllByRole("link")
    expect(links.map((a) => a.textContent)).toEqual(["Mapa", "Blog", "Soporte", "Novedades", "Desarrolladores", "Política de privacidad", "Términos del servicio"])
    expect(screen.getByText(message("es")("content.footer.notice"))).toBeInTheDocument()
  })
})
