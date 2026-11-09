import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "../helpers/intl"

const { track } = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock("@/lib/analytics", () => ({ track }))
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), useRouter: () => ({ push: vi.fn() }) }))
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }))
vi.mock("@/components/ads/useAdPlacements", () => ({ usePlacementOn: () => true }))
vi.mock("@/config/banners", () => ({ pickBanner: () => ({ id: "tcg", sponsor: "S", title: "A deal", cta: "See the deal", href: "https://partner.example", weight: 1 }) }))

import { HeroSearch, ViewMapLink } from "@/components/landing/HeroSearch"
import { DetailsSheet } from "@/components/map/DetailsSheet"
import { SponsoredPlacement, resetAdsForTests } from "@/components/ads/SponsoredPlacement"
import { AssistantCardView } from "@/components/assistant/AssistantCards"

afterEach(() => {
  cleanup()
  track.mockClear()
  sessionStorage.clear()
  resetAdsForTests()
})

// Links navigate in jsdom only as far as a click: keep it from trying.
const click = (el: HTMLElement) => fireEvent.click(el, { button: 0 })
document.addEventListener("click", (e) => e.preventDefault())

describe("product events", () => {
  it("counts leaving the landing page for the map, by how", () => {
    render(
      <>
        <HeroSearch />
        <ViewMapLink />
      </>,
    )
    click(screen.getByRole("link", { name: "Seattle, WA" }))
    click(screen.getByRole("link", { name: "Use my location" }))
    click(screen.getByRole("link", { name: /View full map/ }))
    expect(track.mock.calls).toEqual([
      ["open_map_from_landing", { via: "quick_pick" }],
      ["open_map_from_landing", { via: "my_location" }],
      ["open_map_from_landing", { via: "button" }],
    ])
  })

  it("counts Directions, with the place's kind only", () => {
    render(
      <DetailsSheet
        location={{ id: "a", longitude: -122.3, latitude: 47.6, retailer: "Card Kingdom", address: "1 Main", city: "Seattle", state: "WA", machineID: "", kind: "shop" }}
        backLabel="Back"
        onBack={vi.fn()}
      />,
    )
    click(screen.getByRole("link", { name: /Directions/ }))
    expect(track).toHaveBeenCalledWith("directions_click", { kind: "shop" })
  })

  it("counts a sponsored link followed and a slot dismissed, by placement and banner", () => {
    render(<SponsoredPlacement placement="results" />)
    click(screen.getByRole("link", { name: "A deal" }))
    expect(track).toHaveBeenCalledWith("sponsored_click", { placement: "results", banner: "tcg" })
    click(screen.getByRole("button", { name: "Hide ads for this visit" }))
    expect(track).toHaveBeenCalledWith("sponsored_dismiss", { placement: "results", banner: "tcg" })
  })

  it("counts a place opened from an assistant card", () => {
    render(<AssistantCardView card={{ type: "places", title: "1 near Denver", total: 1, near: null, places: [{ id: "p1", name: "Kroger", kind: "vending", address: "1 Main", city: "Denver", state: "CO", lng: -104.99, lat: 39.74 }] }} />)
    click(screen.getByRole("link", { name: "Kroger on the map" }))
    expect(track).toHaveBeenCalledWith("details_open", { kind: "vending", from: "assistant" })
  })
})
