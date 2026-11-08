// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
vi.mock("@vercel/oidc", () => ({ getVercelOidcToken: vi.fn(async () => "vercel-jwt") }))

import { makeAnthropic, makeGeocoder } from "@/server/container"
import { identityTokenSource } from "@/server/adapters/claude/identity"
import type { ServerConfig } from "@/server/config"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { MapboxGeocoder } from "@/server/adapters/geocoder/mapbox"
import { MapTilerGeocoder } from "@/server/adapters/geocoder/maptiler"
import { NominatimGeocoder } from "@/server/adapters/geocoder/nominatim"
import { PhotonGeocoder } from "@/server/adapters/geocoder/photon"

const config = (overrides: Partial<ServerConfig>) => ({ GEOCODER_PROVIDER: "fake", ...overrides }) as ServerConfig

describe("makeGeocoder", () => {
  it.each([
    ["fake", FakeGeocoder],
    ["photon", PhotonGeocoder],
    ["mapbox", MapboxGeocoder],
    ["maptiler", MapTilerGeocoder],
    ["nominatim", NominatimGeocoder],
  ] as const)("builds the %s adapter", (provider, Adapter) => {
    const geocoder = makeGeocoder(config({ GEOCODER_PROVIDER: provider, GEOCODER_API_KEY: "key", GEOCODER_USER_AGENT: "ua" }))
    expect(geocoder).toBeInstanceOf(Adapter)
  })
})

describe("makeAnthropic", () => {
  it("uses workload identity federation when a rule is configured, with no API key", () => {
    const client = makeAnthropic(config({ ANTHROPIC_FEDERATION_RULE_ID: "fdrl_abc", ANTHROPIC_ORGANIZATION_ID: "org", ANTHROPIC_API_KEY: "sk-ignored", VERCEL: "1" }))
    expect(client?.credentials).toBeTruthy()
    expect(client?.apiKey).toBeNull()
  })

  it("falls back to ANTHROPIC_API_KEY, and to nothing", () => {
    expect(makeAnthropic(config({ ANTHROPIC_API_KEY: "sk-test" }))?.apiKey).toBe("sk-test")
    expect(makeAnthropic(config({}))).toBeNull()
  })

  it("refuses federation where there's no identity to use", () => {
    expect(() => makeAnthropic(config({ ANTHROPIC_FEDERATION_RULE_ID: "fdrl_abc", ANTHROPIC_ORGANIZATION_ID: "org" }))).toThrowError(/no identity here/)
  })
})

describe("identityTokenSource", () => {
  it("takes Vercel's OIDC token on Vercel", async () => {
    await expect(identityTokenSource(config({ VERCEL: "1" }))()).resolves.toBe("vercel-jwt")
  })

  it("requests a GitHub Actions token with the configured audience", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ value: "gha-jwt" })))
    vi.stubGlobal("fetch", fetchMock)
    const source = identityTokenSource(config({ ACTIONS_ID_TOKEN_REQUEST_URL: "https://token.actions.example/req?x=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "req-token", ANTHROPIC_IDENTITY_AUDIENCE: "anthropic" }))
    await expect(source()).resolves.toBe("gha-jwt")
    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit]
    expect(url.toString()).toBe("https://token.actions.example/req?x=1&audience=anthropic")
    expect(init.headers).toEqual({ Authorization: "bearer req-token" })
    vi.unstubAllGlobals()
  })

  it("explains a workflow missing id-token: write", () => {
    expect(() => identityTokenSource(config({ ANTHROPIC_IDENTITY_SOURCE: "github-actions" }))).toThrowError(/id-token: write/)
  })
})
