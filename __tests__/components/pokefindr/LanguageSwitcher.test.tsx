import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"

const { replace, session } = vi.hoisted(() => ({ replace: vi.fn(), session: { current: null as null | { username: string } } }))
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ replace }),
  usePathname: () => "/map",
}))
vi.mock("@/components/providers/SessionProvider", () => ({ useOptionalSession: () => session.current }))

import { LanguageSwitcher, languageName } from "@/components/pokefindr/LanguageSwitcher"

afterEach(() => {
  replace.mockClear()
  session.current = null
  vi.unstubAllGlobals()
  window.history.replaceState(null, "", "/")
})

/** Opens the select and picks a language by its name. */
function pick(name: string) {
  fireEvent.keyDown(screen.getByRole("combobox", { name: /language|idioma/i }), { key: "Enter" })
  fireEvent.click(screen.getByRole("option", { name }))
}

describe("LanguageSwitcher (#182)", () => {
  it("names each language in its own language", () => {
    expect(languageName("en")).toBe("English")
    expect(languageName("es")).toBe("Español")
  })

  it("stays hidden while only one language is public", () => {
    const { container } = render(<LanguageSwitcher />)
    expect(container).toBeEmptyDOMElement()
  })

  it("opens the same page and query in the new language", () => {
    window.history.replaceState(null, "", "/map?state=WA")
    render(<LanguageSwitcher locales={["en", "es"]} />)
    pick("Español")
    expect(replace).toHaveBeenCalledWith("/map?state=WA", { locale: "es" })
  })

  it("saves the choice to a signed-in person's profile", async () => {
    session.current = { username: "ash" }
    const fetch = vi.fn(async () => new Response(JSON.stringify({ ok: true })))
    vi.stubGlobal("fetch", fetch)
    render(<LanguageSwitcher locales={["en", "es"]} variant="compact" />, { locale: "es" })
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveTextContent("es")
    pick("English")
    expect(fetch).toHaveBeenCalledWith("/api/user-settings", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ locale: "en" }) }))
  })

  it("doesn't save anything for a signed-out visitor, or re-pick the current language", () => {
    const fetch = vi.fn()
    vi.stubGlobal("fetch", fetch)
    render(<LanguageSwitcher locales={["en", "es"]} />)
    pick("English")
    expect(replace).not.toHaveBeenCalled()
    pick("Español")
    expect(fetch).not.toHaveBeenCalled()
  })
})
