import { describe, expect, it } from "vitest"
import { render, screen } from "../helpers/intl"
import { EnglishOnlyNotice } from "@/components/EnglishOnlyNotice"

describe("EnglishOnlyNotice", () => {
  it("isn't shown on the English pages", () => {
    const { container } = render(<EnglishOnlyNotice href="/privacy-policy" />)
    expect(container).toBeEmptyDOMElement()
  })

  // The English page's own address; the middleware drops the default language's prefix.
  it("tells Spanish visitors the page is in English and links to it", () => {
    render(<EnglishOnlyNotice href="/terms-of-service" />, { locale: "es" })
    expect(screen.getByRole("note")).toHaveTextContent("Esta página solo está disponible en inglés.")
    expect(screen.getByRole("note")).toHaveAttribute("lang", "es")
    expect(screen.getByRole("link", { name: "Leerla en inglés" })).toHaveAttribute("href", "/en/terms-of-service")
  })
})
