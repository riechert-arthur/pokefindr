// @vitest-environment node
import { describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { makeGeocoder } from "@/server/container"
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
