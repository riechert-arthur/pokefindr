import { describe, expect, it, vi } from "vitest"
import { render, screen } from "../../helpers/intl"

vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), useRouter: () => ({ push: vi.fn() }) }))

import { HeroSearch, pickUrl } from "@/components/landing/HeroSearch"

describe("pickUrl", () => {
  it("opens an area with the default radius, a state as a state, and a location's details", () => {
    expect(pickUrl({ type: "area", area: { label: "Denver, CO", lng: -104.98486, lat: 39.73924, kind: "city", state: "CO" } })).toBe(
      "/map?q=Denver,+CO&lat=39.7392&lng=-104.9849&r=10",
    )
    expect(pickUrl({ type: "area", area: { label: "Washington", lng: -120.7, lat: 47.4, kind: "state", state: "WA" } })).toBe("/map?state=WA")
    const feature = {
      type: "Feature" as const,
      geometry: { type: "Point" as const, coordinates: [0, 0] },
      properties: { id: "abc", machineID: "", retailer: "", address: "", city: "", state: "" },
    }
    expect(pickUrl({ type: "location", feature })).toBe("/map?location=abc")
  })
})

describe("HeroSearch", () => {
  it("links the quick picks and Use my location straight to the map", () => {
    render(<HeroSearch />)
    expect(screen.getByRole("link", { name: "Seattle, WA" })).toHaveAttribute("href", "/map?q=Seattle,+WA&lat=47.6196&lng=-122.3285&r=10")
    // near=me: the viewer's position never goes in the URL.
    expect(screen.getByRole("link", { name: "Use my location" })).toHaveAttribute("href", "/map?r=10&near=me")
    expect(screen.getByRole("button", { name: "Search" })).toBeInTheDocument()
  })
})
