import { describe, expect, it } from "vitest"
import { renderHook } from "../helpers/intl"
import { useApiError } from "@/i18n/useApiError"

describe("API errors in the page's language (#185)", () => {
  it("shows the catalog's message for a known code, with its values", () => {
    const es = renderHook(() => useApiError(), { locale: "es" }).result.current
    expect(es({ error: "That username is already taken", code: "usernameTaken" })).toBe("Ese nombre de usuario ya está en uso")
    expect(es({ error: "…", code: "dailyMessages", values: { limit: 50 } })).toBe("Llegaste al límite de hoy de 50 mensajes. Se reinicia a medianoche UTC.")
  })

  it("falls back to the API's English, then to the caller's message", () => {
    const en = renderHook(() => useApiError()).result.current
    expect(en({ error: "Something new", code: "notInTheCatalog" })).toBe("Something new")
    expect(en(null, "Couldn't send it")).toBe("Couldn't send it")
    expect(en(undefined)).toBe("An unexpected error occurred")
  })
})
