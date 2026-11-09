import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "@testing-library/react"
import { LocationDetails } from "@/components/map/LocationDetails"

vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }))
vi.mock("@/components/ads/useAdPlacements", () => ({ usePlacementOn: () => true }))
vi.mock("@/config/banners", () => ({ pickBanner: () => ({ id: "t", sponsor: "S", title: "A deal", cta: "Go", href: "https://partner.example", weight: 1 }) }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: { username: "ash" } }) }))

const LOCATION = { id: "loc-1", longitude: -122.33, latitude: 47.61, retailer: "QFC", address: "1401 Broadway", city: "Seattle", state: "WA", machineID: "Q1", kind: "vending" }

afterEach(() => vi.unstubAllGlobals())

describe("LocationDetails", () => {
  it("returns focus to Report a problem when the report form closes", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reviews: [], features: [], counts: {}, total: 0 }))))
    render(<LocationDetails location={LOCATION} backLabel="Back" onBack={vi.fn()} kinds={["vending"]} retailers={null} onOpen={vi.fn()} />)
    const report = screen.getByRole("button", { name: "Report a problem" })
    fireEvent.click(report)
    expect(report).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(report).toHaveAttribute("aria-expanded", "false")
    expect(report).toHaveFocus()
  })

  it("shows a sponsored card after the facts, but not while the report form is open", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reviews: [], features: [], counts: {}, total: 0 }))))
    render(<LocationDetails location={LOCATION} backLabel="Back" onBack={vi.fn()} kinds={["vending"]} retailers={null} onOpen={vi.fn()} />)
    expect(screen.getByRole("complementary", { name: "Sponsored: A deal" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Report a problem" }))
    expect(screen.queryByRole("complementary", { name: /Sponsored/ })).toBeNull()
  })
})
