// @vitest-environment node
import { describe, expect, it } from "vitest"
import { vi } from "vitest"

vi.mock("server-only", () => ({}))

import { geocoderContract } from "./contract"
import { FakeGeocoder } from "@/server/adapters/geocoder/fake"
import { MapboxGeocoder } from "@/server/adapters/geocoder/mapbox"
import { MapTilerGeocoder } from "@/server/adapters/geocoder/maptiler"
import { NominatimGeocoder } from "@/server/adapters/geocoder/nominatim"
import { PhotonGeocoder } from "@/server/adapters/geocoder/photon"

geocoderContract("fake", () => new FakeGeocoder())

// Real providers, only when a key is set (or, for Photon, GEOCODER_TEST_PHOTON=1), e.g.
//   GEOCODER_TEST_MAPBOX_KEY=pk.… npx vitest run __tests__/server/geocoder
/* eslint-disable no-restricted-syntax -- test-only switches, not app config */
const live = {
  photon: process.env.GEOCODER_TEST_PHOTON,
  mapbox: process.env.GEOCODER_TEST_MAPBOX_KEY,
  maptiler: process.env.GEOCODER_TEST_MAPTILER_KEY,
  nominatim: process.env.GEOCODER_TEST_NOMINATIM_USER_AGENT,
}
/* eslint-enable no-restricted-syntax */
if (live.photon) geocoderContract("photon", () => new PhotonGeocoder(), { timeout: 15000 })
if (live.mapbox) geocoderContract("mapbox", () => new MapboxGeocoder(live.mapbox!), { timeout: 15000 })
if (live.maptiler) geocoderContract("maptiler", () => new MapTilerGeocoder(live.maptiler!), { timeout: 15000 })
if (live.nominatim) geocoderContract("nominatim", () => new NominatimGeocoder(live.nominatim!), { timeout: 15000 })

describe("FakeGeocoder", () => {
  it("ranks label prefixes first, then word prefixes", async () => {
    const labels = (await new FakeGeocoder().search("wa", { limit: 10 })).map((r) => r.label)
    expect(labels[0]).toBe("Washington")
    expect(labels).toContain("Seattle, WA")
  })

  it("puts the closest match first when given `near`", async () => {
    const [first] = await new FakeGeocoder().search("Den", { near: [-97, 33] })
    expect(first.label).toBe("Denton, TX")
  })

  it("knows only the US", async () => {
    expect(await new FakeGeocoder().search("Seattle", { country: "ca" })).toEqual([])
  })
})
