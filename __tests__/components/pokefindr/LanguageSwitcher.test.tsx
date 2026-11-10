import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"

const { replace, session, patch } = vi.hoisted(() => ({
  replace: vi.fn(),
  session: { current: null as null | { username: string }, loading: false },
  patch: vi.fn(async () => ({ data: { ok: true } })),
}))
vi.mock("@/i18n/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/i18n/navigation")>()),
  useRouter: () => ({ replace }),
  usePathname: () => "/map",
}))
vi.mock("@/components/providers/SessionProvider", () => ({ useOptionalSession: () => session.current, useOptionalSessionLoading: () => session.loading }))
vi.mock("axios", () => ({ default: { patch } }))

import { LanguageSwitcher, languageName } from "@/components/pokefindr/LanguageSwitcher"

afterEach(() => {
  replace.mockClear()
  patch.mockClear()
  session.current = null
  session.loading = false
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

  it("stays hidden with only one language", () => {
    const { container } = render(<LanguageSwitcher locales={["en"]} />)
    expect(container).toBeEmptyDOMElement()
  })

  it("offers the public languages (#186)", () => {
    render(<LanguageSwitcher />)
    fireEvent.keyDown(screen.getByRole("combobox", { name: "Language" }), { key: "Enter" })
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["English", "Español"])
  })

  it("opens the same page, query and fragment in the new language", () => {
    window.history.replaceState(null, "", "/map?state=WA#results")
    render(<LanguageSwitcher locales={["en", "es"]} />)
    pick("Español")
    expect(replace).toHaveBeenCalledWith("/map?state=WA#results", { locale: "es" })
  })

  it("saves the choice to a signed-in person's profile", async () => {
    session.current = { username: "ash" }
    render(<LanguageSwitcher locales={["en", "es"]} variant="compact" />, { locale: "es" })
    expect(screen.getByRole("combobox", { name: "Idioma" })).toHaveTextContent("es")
    pick("English")
    expect(patch).toHaveBeenCalledWith("/api/user-settings", { locale: "en" }, { withCredentials: true })
  })

  it("saves a choice made while the session loads, once it has", () => {
    session.loading = true
    const { rerender } = render(<LanguageSwitcher locales={["en", "es"]} />)
    pick("Español")
    expect(patch).not.toHaveBeenCalled()
    session.loading = false
    session.current = { username: "ash" }
    rerender(<LanguageSwitcher locales={["en", "es"]} />)
    expect(patch).toHaveBeenCalledWith("/api/user-settings", { locale: "es" }, { withCredentials: true })
  })

  it("doesn't save anything for a signed-out visitor, or re-pick the current language", () => {
    render(<LanguageSwitcher locales={["en", "es"]} />)
    pick("English")
    expect(replace).not.toHaveBeenCalled()
    pick("Español")
    expect(patch).not.toHaveBeenCalled()
  })
})
