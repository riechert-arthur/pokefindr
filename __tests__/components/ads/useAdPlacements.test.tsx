import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "../../helpers/intl"

vi.mock("@/config/banners", () => ({ pickBanner: () => ({ id: "t", sponsor: "S", title: "A deal", cta: "Go", href: "https://partner.example", weight: 1 }) }))

import { SponsoredPlacement } from "@/components/ads/SponsoredPlacement"
import { resetAdPlacementsForTests } from "@/components/ads/useAdPlacements"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  resetAdPlacementsForTests()
})

const serve = (placements: unknown) => vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ placements }))))

describe("placement switches (#159)", () => {
  it("shows a slot whose placement is on", async () => {
    serve({ results: true, details: true, landing: true })
    render(<SponsoredPlacement placement="details" />)
    expect(await screen.findByRole("complementary", { name: "Sponsored: A deal" })).toBeInTheDocument()
  })

  it("hides a slot an admin switched off, and doesn't flash it while loading", async () => {
    let answer!: (r: Response) => void
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (answer = r))))
    render(<SponsoredPlacement placement="details" />)
    expect(screen.queryByRole("complementary")).toBeNull()
    answer(new Response(JSON.stringify({ placements: { results: true, details: false, landing: true } })))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole("complementary")).toBeNull()
  })

  it("shows nothing when the flags can't be read", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })))
    render(<SponsoredPlacement placement="results" />)
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByRole("complementary")).toBeNull()
  })
})

describe("the landing strip's reserved band (#298)", () => {
  it("holds the space, without the banner, until this page load's switches arrive; collapses if it's off", async () => {
    let answer!: (r: Response) => void
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((r) => (answer = r))))
    const { container } = render(<SponsoredPlacement placement="landing" reserve />)
    expect(container.querySelector('[data-placement="landing"]')).not.toBeNull()
    expect(screen.queryByRole("complementary")).toBeNull()
    answer(new Response(JSON.stringify({ placements: { results: true, details: true, landing: false } })))
    await new Promise((r) => setTimeout(r, 0))
    expect(container.querySelector('[data-placement="landing"]')).toBeNull()
  })

  it("fills it with the banner when the strip is on", async () => {
    serve({ results: true, details: true, landing: true })
    render(<SponsoredPlacement placement="landing" reserve />)
    expect(await screen.findByRole("complementary", { name: "Sponsored: A deal" })).toBeInTheDocument()
  })
})
