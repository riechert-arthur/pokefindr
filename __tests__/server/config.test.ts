// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getServerConfig, resetServerConfigForTests } from "@/server/config"

const validEnv = {
  APP_URL: "https://pokefindr.example",
  JWT_SECRET: "secret",
  DATABASE_URL: "postgres://user:pass@localhost:5432/pokefindr",
}

describe("getServerConfig", () => {
  beforeEach(() => {
    resetServerConfigForTests()
    for (const [key, value] of Object.entries(validEnv)) vi.stubEnv(key, value)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    resetServerConfigForTests()
  })

  it("parses a valid environment", () => {
    const config = getServerConfig()
    expect(config.APP_URL).toBe("https://pokefindr.example")
    expect(config.JWT_SECRET).toBe("secret")
  })

  it("names every missing or invalid variable", () => {
    vi.stubEnv("APP_URL", "not a url")
    vi.stubEnv("JWT_SECRET", "")

    expect(() => getServerConfig()).toThrowError(/APP_URL[\s\S]*JWT_SECRET/)
  })

  it("allows DATABASE_URL to be missing until the app uses the database", () => {
    vi.stubEnv("DATABASE_URL", undefined)
    expect(getServerConfig().DATABASE_URL).toBeUndefined()
  })

  it("treats blank DATABASE_URL and DATABASE_POOL_MAX as unset", () => {
    vi.stubEnv("DATABASE_URL", "")
    vi.stubEnv("DATABASE_POOL_MAX", "")
    const config = getServerConfig()
    expect(config.DATABASE_URL).toBeUndefined()
    expect(config.DATABASE_POOL_MAX).toBe(5)
  })

  it("allows CRON_SECRET to be unset or blank", () => {
    vi.stubEnv("CRON_SECRET", "")
    expect(getServerConfig().CRON_SECRET).toBeUndefined()
  })

  it("rejects a CRON_SECRET shorter than 16 characters", () => {
    vi.stubEnv("CRON_SECRET", "too-short")
    expect(() => getServerConfig()).toThrowError(/CRON_SECRET/)
  })

  it("rejects an invalid DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "not a url")
    expect(() => getServerConfig()).toThrowError(/DATABASE_URL/)
  })

  it("defaults the geocoder to fake, with no key", () => {
    expect(getServerConfig().GEOCODER_PROVIDER).toBe("fake")
  })

  it("defaults the geocoder to photon in production, which needs no key", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(getServerConfig().GEOCODER_PROVIDER).toBe("photon")
  })

  it("routes with straight lines unless an OpenRouteService key is set, even in production", () => {
    vi.stubEnv("NODE_ENV", "production")
    expect(getServerConfig()).toMatchObject({ ROUTER_PROVIDER: "fake", ROUTER_DAILY_CAP: 1800 })
    resetServerConfigForTests()
    vi.stubEnv("ROUTER_API_KEY", "key")
    expect(getServerConfig().ROUTER_PROVIDER).toBe("openrouteservice")
  })

  it("requires ROUTER_API_KEY for openrouteservice", () => {
    vi.stubEnv("ROUTER_PROVIDER", "openrouteservice")
    expect(() => getServerConfig()).toThrowError(/ROUTER_API_KEY: required when ROUTER_PROVIDER is openrouteservice/)
  })

  it.each([["mapbox"], ["maptiler"]])("requires GEOCODER_API_KEY for %s", (provider) => {
    vi.stubEnv("GEOCODER_PROVIDER", provider)
    expect(() => getServerConfig()).toThrowError(/GEOCODER_API_KEY: required when GEOCODER_PROVIDER is/)
    resetServerConfigForTests()
    vi.stubEnv("GEOCODER_API_KEY", "key")
    expect(getServerConfig().GEOCODER_PROVIDER).toBe(provider)
  })

  it("requires GEOCODER_USER_AGENT for nominatim", () => {
    vi.stubEnv("GEOCODER_PROVIDER", "nominatim")
    expect(() => getServerConfig()).toThrowError(/GEOCODER_USER_AGENT/)
  })

  it("needs both the federation rule and the organization, or neither", () => {
    vi.stubEnv("ANTHROPIC_FEDERATION_RULE_ID", "fdrl_abc")
    expect(() => getServerConfig()).toThrowError(/ANTHROPIC_ORGANIZATION_ID/)
    resetServerConfigForTests()
    vi.stubEnv("ANTHROPIC_ORGANIZATION_ID", "org-uuid")
    expect(getServerConfig()).toMatchObject({ ANTHROPIC_FEDERATION_RULE_ID: "fdrl_abc", ANTHROPIC_ORGANIZATION_ID: "org-uuid" })
  })

  it("prints email by default, and needs SMTP_URL to send it", () => {
    expect(getServerConfig().MAIL_PROVIDER).toBe("console")
    resetServerConfigForTests()
    vi.stubEnv("MAIL_PROVIDER", "smtp")
    expect(() => getServerConfig()).toThrowError(/SMTP_URL: required when MAIL_PROVIDER is smtp/)
    resetServerConfigForTests()
    vi.stubEnv("SMTP_URL", "smtp://localhost:1025")
    expect(getServerConfig().SMTP_URL).toBe("smtp://localhost:1025")
  })

  it("needs both halves of an OAuth provider's credentials", () => {
    vi.stubEnv("GOOGLE_CLIENT_ID", "id")
    expect(() => getServerConfig()).toThrowError(/GOOGLE_CLIENT_SECRET: google sign-in needs both/)
    resetServerConfigForTests()
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret")
    expect(getServerConfig().GOOGLE_CLIENT_ID).toBe("id")
  })

  it("needs MAIL_FROM to send email in production", () => {
    vi.stubEnv("MAIL_PROVIDER", "smtp")
    vi.stubEnv("SMTP_URL", "smtp://localhost:1025")
    expect(getServerConfig().MAIL_FROM).toBe("PokeFindr <no-reply@localhost>")
    resetServerConfigForTests()
    vi.stubEnv("NODE_ENV", "production")
    expect(() => getServerConfig()).toThrowError(/MAIL_FROM: required to send email in production/)
    resetServerConfigForTests()
    vi.stubEnv("MAIL_FROM", "PokeFindr <no-reply@pokefindr.app>")
    expect(getServerConfig().MAIL_FROM).toBe("PokeFindr <no-reply@pokefindr.app>")
  })

  it("rejects an unknown GEOCODER_PROVIDER", () => {
    vi.stubEnv("GEOCODER_PROVIDER", "google")
    expect(() => getServerConfig()).toThrowError(/GEOCODER_PROVIDER/)
  })

  it("caches the parsed result", () => {
    const first = getServerConfig()
    vi.stubEnv("APP_URL", "https://changed.example")
    expect(getServerConfig()).toBe(first)
  })

  it("keeps profile pictures on disk in dev, in Vercel Blob with a token, and off in production without one", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", undefined)
    vi.stubEnv("IMAGE_STORE", undefined)
    expect(getServerConfig().IMAGE_STORE).toBe("local")
    resetServerConfigForTests()
    vi.stubEnv("NODE_ENV", "production")
    expect(getServerConfig().IMAGE_STORE).toBe("none")
    resetServerConfigForTests()
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_x")
    expect(getServerConfig().IMAGE_STORE).toBe("vercel-blob")
  })

  it("requires BLOB_READ_WRITE_TOKEN for IMAGE_STORE=vercel-blob", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", undefined)
    vi.stubEnv("IMAGE_STORE", "vercel-blob")
    expect(() => getServerConfig()).toThrowError(/BLOB_READ_WRITE_TOKEN: required when IMAGE_STORE is vercel-blob/)
  })
})
