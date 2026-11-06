// @vitest-environment node
import { describe, expect, it, vi } from "vitest"
import { PRODUCTION_URL, getSiteUrl } from "@/server/site-url"

describe("getSiteUrl", () => {
  it("uses SITE_URL when it's valid", () => {
    expect(getSiteUrl({ SITE_URL: "https://staging.pokefindr.app" })?.href).toBe("https://staging.pokefindr.app/")
  })

  it("ignores an invalid SITE_URL instead of throwing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    expect(getSiteUrl({ SITE_URL: "pokefindr.app", NODE_ENV: "production" })?.href).toBe(`${PRODUCTION_URL}/`)
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("leaves it to Next in dev and on Vercel previews", () => {
    expect(getSiteUrl({ NODE_ENV: "development" })).toBeUndefined()
    expect(getSiteUrl({ NODE_ENV: "production", VERCEL_ENV: "preview" })).toBeUndefined()
  })

  it("uses the production URL on Vercel production and when self-hosted", () => {
    expect(getSiteUrl({ NODE_ENV: "production", VERCEL_ENV: "production" })?.href).toBe(`${PRODUCTION_URL}/`)
    expect(getSiteUrl({ NODE_ENV: "production" })?.href).toBe(`${PRODUCTION_URL}/`)
  })
})
