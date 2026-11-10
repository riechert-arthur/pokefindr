// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("server-only", () => ({}))
const search = vi.fn()
vi.mock("@/server/container", () => ({ getGeocoder: () => ({ search }) }))
vi.mock("@/server/services/locations", () => ({ getLocationFeature: vi.fn() }))
vi.mock("@/components/map/MapLoader", () => ({ MapLoader: () => null }))
const redirect = vi.fn((url: string) => {
  throw new Error(`REDIRECT ${url}`)
})
vi.mock("next-intl/server", () => ({ getLocale: async () => "en" }))
vi.mock("@/i18n/navigation", () => ({ redirect: ({ href }: { href: string }) => redirect(href) }))

import MapPage from "@/app/[locale]/(dashboard)/map/page"

const open = (query: Record<string, string>) => MapPage({ searchParams: Promise.resolve(query) })

beforeEach(() => {
  search.mockReset()
  redirect.mockClear()
})

describe("/map with a place name only", () => {
  it("geocodes it and redirects to the full place", async () => {
    search.mockResolvedValue([{ label: "Seattle, WA", lng: -122.33012, lat: 47.60383, kind: "city", state: "WA" }])
    await expect(open({ q: "Seattle", r: "10" })).rejects.toThrow("REDIRECT /map?q=Seattle,+WA&lat=47.6038&lng=-122.3301&r=10")
    expect(search).toHaveBeenCalledWith("Seattle", { limit: 1 })
  })

  it("opens a state as a state", async () => {
    search.mockResolvedValue([{ label: "Washington", lng: -120.7, lat: 47.4, kind: "state", state: "WA" }])
    await expect(open({ q: "Washington state" })).rejects.toThrow("REDIRECT /map?state=WA")
  })

  it("opens the US when the name isn't found or the geocoder fails", async () => {
    search.mockResolvedValue([])
    await open({ q: "qqzx" })
    vi.spyOn(console, "error").mockImplementation(() => {})
    search.mockRejectedValue(new Error("down"))
    await open({ q: "Seattle" })
    expect(redirect).not.toHaveBeenCalled()
  })

  it("leaves full places alone", async () => {
    await open({ q: "Seattle, WA", lat: "47.6", lng: "-122.3" })
    await open({ near: "me" })
    expect(search).not.toHaveBeenCalled()
  })
})
