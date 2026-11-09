import { afterEach, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"

const { banner } = vi.hoisted(() => ({
  banner: { current: { id: "t", sponsor: "TCGplayer", title: "Missed the restock?", body: "10% off.", cta: "See the deal", href: "https://partner.example/x", pixel: "https://pixel.example/p", weight: 1 } as Record<string, unknown> | null },
}))
vi.mock("@/config/banners", () => ({ pickBanner: () => banner.current }))

import { SponsoredPlacement, resetAdsForTests } from "@/components/ads/SponsoredPlacement"
import { ResultsSheet } from "@/components/map/ResultsSheet"

afterEach(() => {
  cleanup()
  sessionStorage.clear()
  resetAdsForTests()
  banner.current = { id: "t", sponsor: "TCGplayer", title: "Missed the restock?", body: "10% off.", cta: "See the deal", href: "https://partner.example/x", pixel: "https://pixel.example/p", weight: 1 }
})

describe("SponsoredPlacement", () => {
  it("shows the banner labeled Sponsored, with a sponsored, nofollow link", () => {
    render(<SponsoredPlacement placement="details" />)
    const slot = screen.getByRole("complementary", { name: "Sponsored: Missed the restock?" })
    expect(slot).toHaveTextContent("Sponsored · TCGplayer")
    const link = screen.getByRole("link", { name: "Missed the restock?" })
    expect(link).toHaveAttribute("href", "https://partner.example/x")
    expect(link.getAttribute("rel")).toContain("sponsored")
    expect(link.getAttribute("rel")).toContain("nofollow")
  })

  it("the landing strip is a band with a button link", () => {
    const { container } = render(<SponsoredPlacement placement="landing" />)
    expect(container.querySelector('[data-placement="landing"]')).toHaveClass("border-t")
    expect(screen.getByRole("link", { name: "See the deal" })).toHaveAttribute("href", "https://partner.example/x")
  })

  it("hides every slot for the rest of the visit once one is dismissed", () => {
    render(
      <>
        <SponsoredPlacement placement="results" />
        <SponsoredPlacement placement="details" />
      </>,
    )
    expect(screen.getAllByRole("complementary")).toHaveLength(2)
    act(() => fireEvent.click(screen.getAllByRole("button", { name: "Hide ads for this visit" })[0]))
    expect(screen.queryByRole("complementary")).toBeNull()
    expect(sessionStorage.getItem("pf:ads-hidden")).toBe("1")
    cleanup()
    // A new view in the same visit: still hidden.
    render(<SponsoredPlacement placement="landing" />)
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("shows nothing without a banner for the placement", () => {
    banner.current = null
    const { container } = render(<SponsoredPlacement placement="results" />)
    expect(container).toBeEmptyDOMElement()
  })

  it("loads the impression pixel only in production", () => {
    const { container, unmount } = render(<SponsoredPlacement placement="details" />)
    expect(container.querySelector('img[src="https://pixel.example/p"]')).toBeNull()
    unmount()
    vi.stubEnv("NODE_ENV", "production")
    const prod = render(<SponsoredPlacement placement="details" />)
    expect(prod.container.querySelector('img[src="https://pixel.example/p"]')).not.toBeNull()
    vi.unstubAllEnvs()
  })
})

const feature = (id: string) => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [-122.32, 47.62] },
  properties: { id, machineID: id, retailer: `Store ${id}`, address: "1 Main St", city: "Seattle", state: "WA", kind: "vending" as const, distance: 1 },
})

describe("the results slot", () => {
  const sheet = (n: number) =>
    render(
      <ResultsSheet
        label="Seattle, WA"
        radius={10}
        onRadiusChange={vi.fn()}
        kinds={["vending", "shop", "event"]}
        nearby={{ status: "ready", reload: vi.fn(), results: { type: "FeatureCollection", features: Array.from({ length: n }, (_, i) => feature(String(i))), counts: { vending: n }, total: n, truncated: false } }}
        onOpen={vi.fn()}
      />,
    )

  it("comes after the third place, when more follow", () => {
    sheet(5)
    const items = screen.getAllByRole("listitem")
    expect(items).toHaveLength(6)
    expect(items[3]).toContainElement(screen.getByRole("complementary"))
  })

  it("isn't shown in a list of three or fewer", () => {
    sheet(3)
    expect(screen.queryByRole("complementary")).toBeNull()
  })
})
