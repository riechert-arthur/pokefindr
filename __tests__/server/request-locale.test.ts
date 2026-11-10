// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
vi.mock("server-only", () => ({}))
import { pickedLocale, requestLocale, signupLocale } from "@/server/i18n"
import { localizedCallback, VERIFIED_CALLBACK } from "@/lib/auth/paths"
import { PUBLIC_LOCALES } from "@/i18n/routing"

const req = (headers: Record<string, string>) => new Request("https://pokefindr.app/api/auth/x", { method: "POST", headers })

describe("a request's language (#185)", () => {
  it("reads a prefixed Referer, else the cookie, else English", () => {
    expect(requestLocale(req({ referer: "https://pokefindr.app/es/signup" }))).toBe("es")
    // The OAuth callback page has no prefix: the cookie still answers.
    expect(requestLocale(req({ referer: "https://pokefindr.app/login/callback", cookie: "NEXT_LOCALE=es" }))).toBe("es")
    expect(requestLocale(req({ referer: "https://pokefindr.app/signup" }))).toBe("en")
    expect(pickedLocale(req({ referer: "https://pokefindr.app/signup" }))).toBeNull()
  })

  it("saves a language at sign-up only when the visitor picked a public one other than English", () => {
    expect(signupLocale(req({ referer: "https://pokefindr.app/signup" }))).toBeNull()
    expect(signupLocale(req({ cookie: "NEXT_LOCALE=en" }))).toBeNull()
    expect(signupLocale(req({ referer: "https://pokefindr.app/es/signup" }))).toBe(PUBLIC_LOCALES.includes("es") ? "es" : null)
  })

  it("sends email links to the page in the same language", () => {
    expect(localizedCallback(VERIFIED_CALLBACK, "en")).toBe("/login?verified=1")
    expect(localizedCallback(VERIFIED_CALLBACK, "es")).toBe("/es/login?verified=1")
  })
})
