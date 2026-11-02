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

  it("caches the parsed result", () => {
    const first = getServerConfig()
    vi.stubEnv("APP_URL", "https://changed.example")
    expect(getServerConfig()).toBe(first)
  })
})
