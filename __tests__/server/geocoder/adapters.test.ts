// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))

import { MapboxGeocoder } from "@/server/adapters/geocoder/mapbox"
import { MapTilerGeocoder } from "@/server/adapters/geocoder/maptiler"
import { NominatimGeocoder } from "@/server/adapters/geocoder/nominatim"
import { GeocoderError } from "@/server/ports/geocoder"

/** Answers every fetch with `body` and records the requests. */
function mockFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", fetchMock)
  return () => {
    const [url, init] = fetchMock.mock.calls[0]
    return { url: new URL(String(url)), headers: new Headers(init?.headers) }
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("MapboxGeocoder", () => {
  const body = {
    features: [
      {
        properties: {
          feature_type: "place",
          name: "Denver",
          place_formatted: "Colorado, United States",
          coordinates: { longitude: -104.99, latitude: 39.74 },
          bbox: [-105.1, 39.61, -104.6, 39.91],
          context: { region: { name: "Colorado", region_code: "CO" } },
        },
      },
      {
        properties: {
          feature_type: "address",
          name: "1600 Pennsylvania Avenue Northwest",
          full_address: "1600 Pennsylvania Avenue Northwest, Washington, District of Columbia 20500, United States",
          coordinates: { longitude: -77.03, latitude: 38.89 },
          context: { region: { name: "District of Columbia", region_code: "DC" }, place: { name: "Washington" } },
        },
      },
      { properties: { feature_type: "region", name: "Colorado", coordinates: { longitude: -105.5, latitude: 39 } } },
    ],
  }

  it("asks for US results near the viewer and maps each kind", async () => {
    const request = mockFetch(body)
    const results = await new MapboxGeocoder("pk.test").search("Den", { near: [-105, 39.7], limit: 3 })
    const { url } = request()
    expect(url.pathname).toBe("/search/geocode/v6/forward")
    expect(Object.fromEntries(url.searchParams)).toMatchObject({ q: "Den", country: "us", proximity: "-105,39.7", limit: "3", autocomplete: "true" })
    expect(results).toEqual([
      { label: "Denver, CO", lng: -104.99, lat: 39.74, bbox: [-105.1, 39.61, -104.6, 39.91], kind: "city", state: "CO" },
      {
        label: "1600 Pennsylvania Avenue Northwest, Washington, DC",
        lng: -77.03,
        lat: 38.89,
        bbox: undefined,
        kind: "address",
        state: "DC",
      },
      { label: "Colorado", lng: -105.5, lat: 39, bbox: undefined, kind: "state", state: "CO" },
    ])
  })

  it("throws a GeocoderError without the key on an error status", async () => {
    mockFetch({ message: "Not Authorized" }, 401)
    const error = await new MapboxGeocoder("pk.secret").search("Denver").catch((e) => e)
    expect(error).toBeInstanceOf(GeocoderError)
    expect(error.status).toBe(401)
    expect(error.message).not.toContain("pk.secret")
  })

  it("turns a timeout, a network failure or a non-JSON body into a GeocoderError", async () => {
    for (const fail of [
      () => Promise.reject(new DOMException("The operation timed out.", "TimeoutError")),
      () => Promise.reject(new TypeError("fetch failed: https://api.mapbox.com/?access_token=pk.secret")),
      async () => new Response("<html>captive portal</html>", { status: 200 }),
    ]) {
      vi.stubGlobal("fetch", vi.fn(fail))
      const error = await new MapboxGeocoder("pk.secret").search("Denver").catch((e) => e)
      expect(error).toBeInstanceOf(GeocoderError)
      expect(error.message).not.toContain("pk.secret")
    }
  })

  it("rethrows when the caller aborts", async () => {
    const controller = new AbortController()
    controller.abort()
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new DOMException("Aborted", "AbortError"))))
    const error = await new MapboxGeocoder("pk.test").search("Denver", { signal: controller.signal }).catch((e) => e)
    expect(error).not.toBeInstanceOf(GeocoderError)
    expect(error.name).toBe("AbortError")
  })
})

describe("MapTilerGeocoder", () => {
  it("maps municipalities, postcodes and regions", async () => {
    const request = mockFetch({
      features: [
        {
          place_type: ["municipality"],
          text: "Seattle",
          place_name: "Seattle, Washington, United States",
          center: [-122.33, 47.6],
          bbox: [-122.46, 47.49, -122.22, 47.73],
          context: [{ id: "county.1", text: "King County" }, { id: "region.2", text: "Washington" }, { id: "country.3", text: "United States" }],
        },
        { place_type: ["postal_code"], text: "98101", place_name: "98101, Seattle, Washington, United States", center: [-122.33, 47.61], context: [{ id: "region.2", text: "Washington" }] },
        { place_type: ["region"], text: "Washington", place_name: "Washington, United States", center: [-120.7, 47.4] },
      ],
    })
    const results = await new MapTilerGeocoder("key").search("Seattle")
    expect(request().url.pathname).toBe("/geocoding/Seattle.json")
    expect(results.map(({ label, kind, state }) => ({ label, kind, state }))).toEqual([
      { label: "Seattle, WA", kind: "city", state: "WA" },
      { label: "98101, Seattle, WA", kind: "postcode", state: "WA" },
      { label: "Washington", kind: "state", state: "WA" },
    ])
  })
})

describe("NominatimGeocoder", () => {
  it("sends the User-Agent and builds short labels", async () => {
    const request = mockFetch([
      {
        lat: "47.6038",
        lon: "-122.3301",
        name: "Seattle",
        display_name: "Seattle, King County, Washington, United States",
        addresstype: "city",
        boundingbox: ["47.4919", "47.7341", "-122.4598", "-122.2244"],
        address: { city: "Seattle", state: "Washington", "ISO3166-2-lvl4": "US-WA" },
      },
      {
        lat: "38.8977",
        lon: "-77.0365",
        name: "White House",
        display_name: "White House, 1600, Pennsylvania Avenue Northwest, Washington, District of Columbia, 20500, United States",
        addresstype: "office",
        address: { house_number: "1600", road: "Pennsylvania Avenue Northwest", city: "Washington", "ISO3166-2-lvl4": "US-DC" },
      },
      { lat: "not a number", lon: "0", display_name: "Broken", addresstype: "city" },
    ])
    const results = await new NominatimGeocoder("PokeFindr test").search("Seattle")
    const { url, headers } = request()
    expect(headers.get("user-agent")).toBe("PokeFindr test")
    expect(url.pathname).toBe("/search")
    expect(url.searchParams.get("countrycodes")).toBe("us")
    expect(results).toEqual([
      { label: "Seattle, WA", lng: -122.3301, lat: 47.6038, bbox: [-122.4598, 47.4919, -122.2244, 47.7341], kind: "city", state: "WA" },
      { label: "1600 Pennsylvania Avenue Northwest, Washington, DC", lng: -77.0365, lat: 38.8977, bbox: undefined, kind: "address", state: "DC" },
    ])
  })
})

describe("a self-hosted base URL", () => {
  it("keeps the base URL's path", async () => {
    const request = mockFetch([])
    await new NominatimGeocoder("PokeFindr test", "https://geo.example.com/nominatim").search("Seattle")
    expect(request().url.toString()).toMatch(/^https:\/\/geo\.example\.com\/nominatim\/search\?/)
  })
})
