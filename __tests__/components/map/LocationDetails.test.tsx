import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
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

  it("fetches a shop's website and links it under the location, in a new tab (#399)", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url === "/api/locations/shop-1" ? { type: "Feature", properties: { website: "https://www.bleeckertrading.com/" } } : { reviews: [], features: [], counts: {}, total: 0 })),
    )
    vi.stubGlobal("fetch", fetchMock)
    const shop = { ...LOCATION, id: "shop-1", kind: "shop", retailer: "Bleecker Trading", machineID: "" }
    render(<LocationDetails location={shop} backLabel="Back" onBack={vi.fn()} kinds={["shop"]} retailers={null} onOpen={vi.fn()} />)
    const link = await screen.findByRole("link", { name: "bleeckertrading.com (opens in a new tab)" })
    expect(link).toHaveAttribute("href", "https://www.bleeckertrading.com/")
    expect(link).toHaveAttribute("target", "_blank")
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow")
    expect(screen.getByText("Website")).toBeInTheDocument()
  })

  it("asks for no website for a vending machine, and shows no row when a shop has none", async () => {
    const fetchMock = vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith("/api/locations/shop-2") && !url.includes("/reviews") ? { type: "Feature", properties: { website: null } } : { reviews: [], features: [], counts: {}, total: 0 })))
    vi.stubGlobal("fetch", fetchMock)
    const { unmount } = render(<LocationDetails location={LOCATION} backLabel="Back" onBack={vi.fn()} kinds={["vending"]} retailers={null} onOpen={vi.fn()} />)
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/locations/loc-1")
    unmount()
    render(<LocationDetails location={{ ...LOCATION, id: "shop-2", kind: "shop" }} backLabel="Back" onBack={vi.fn()} kinds={["shop"]} retailers={null} onOpen={vi.fn()} />)
    await vi.waitFor(() => expect(fetchMock.mock.calls.map(([url]) => url)).toContain("/api/locations/shop-2"))
    expect(screen.queryByText("Website")).toBeNull()
  })

  it("doesn't ask again for a website the location already came with (a shared link)", () => {
    const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => new Response(JSON.stringify({ reviews: [], features: [], counts: {}, total: 0 })))
    vi.stubGlobal("fetch", fetchMock)
    render(<LocationDetails location={{ ...LOCATION, id: "shop-3", kind: "shop", website: "https://cards.example/" }} backLabel="Back" onBack={vi.fn()} kinds={["shop"]} retailers={null} onOpen={vi.fn()} />)
    expect(screen.getByRole("link", { name: "cards.example (opens in a new tab)" })).toBeInTheDocument()
    expect(fetchMock.mock.calls.map(([url]) => url)).not.toContain("/api/locations/shop-3")
  })

  it("never links a website that isn't a web address", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ reviews: [], features: [], counts: {}, total: 0 }))))
    render(<LocationDetails location={{ ...LOCATION, kind: "shop", website: "javascript:alert(1)" }} backLabel="Back" onBack={vi.fn()} kinds={["shop"]} retailers={null} onOpen={vi.fn()} />)
    expect(screen.queryByText("Website")).toBeNull()
    expect(screen.queryByRole("link", { name: /alert/ })).toBeNull()
  })
})
