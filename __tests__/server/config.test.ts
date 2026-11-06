// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { getServerConfig, resetServerConfigForTests } from "@/server/config"

const validEnv = {
  APP_URL: "https://pokefindr.example",
  JWT_SECRET: "secret",
  DATABASE_URL: "postgres://user:pass@localhost:5432/pokefindr",
  NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
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

  it("rejects a CRON_SECRET shorter than 32 characters", () => {
    vi.stubEnv("CRON_SECRET", "too-short")
    expect(() => getServerConfig()).toThrowError(/CRON_SECRET/)
  })

  it("rejects an invalid DATABASE_URL", () => {
    vi.stubEnv("DATABASE_URL", "not a url")
    expect(() => getServerConfig()).toThrowError(/DATABASE_URL/)
  })

  it("caches the parsed result", () => {
    const first = getServerConfig()
    vi.stubEnv("APP_URL", "https://changed.example")
    expect(getServerConfig()).toBe(first)
  })
})
