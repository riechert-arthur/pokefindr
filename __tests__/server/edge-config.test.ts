// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"
import { getJwtSecret } from "@/server/edge-config"

describe("getJwtSecret", () => {
  afterEach(() => vi.unstubAllEnvs())

  it("returns JWT_SECRET", () => {
    vi.stubEnv("JWT_SECRET", "s3cret")
    expect(getJwtSecret()).toBe("s3cret")
  })

  it("throws when JWT_SECRET is missing", () => {
    vi.stubEnv("JWT_SECRET", "")
    expect(() => getJwtSecret()).toThrow(/JWT_SECRET/)
  })
})
