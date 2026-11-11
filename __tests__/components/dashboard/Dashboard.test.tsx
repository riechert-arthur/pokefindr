import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, message, render, screen, waitFor } from "../../helpers/intl"
import { Dashboard, SUGGESTIONS } from "@/components/dashboard/Dashboard"

vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), usePathname: () => "/home", useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/providers/SidebarContextProvider", () => ({ useSidebar: () => ({ isSidebarOpen: false, toggleSidebar: vi.fn() }) }))
vi.mock("@/components/providers/SessionProvider", () => ({ useSessionContext: () => ({ session: { id: "u1", username: "ash" }, isLoading: false }) }))
vi.mock("@/components/pokefindr/UserMenu", () => ({ UserMenu: () => null }))

const json = (body: unknown) => new Response(JSON.stringify(body))
const ROUTES: Record<string, unknown> = {
  "/api/locations/aggregates": { counts: [{ country: "US", region: "WA", kind: "vending", count: 1200 }, { country: "US", region: "OR", kind: "vending", count: 257 }, { country: "US", region: "WA", kind: "shop", count: 3 }] },
  "/api/my-reviews": { reviews: [{ id: "r1", rating: 4, comment: "Stocked Tuesday", location: { id: "loc-1", name: "Safeway", city: "Seattle", state: "WA" } }] },
  "/api/highlights": { hotspots: [], events: [{ id: "e1", title: "Card show", startsAt: "2026-11-14T18:00:00Z", endsAt: null, city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: true }] },
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => (url.startsWith("/api/locations/counts") ? json({ counts: [42] }) : json(ROUTES[url]))))
})
afterEach(() => vi.unstubAllGlobals())

describe("Dashboard", () => {
  it("greets with the machine count, and fills the tiles", async () => {
    render(<Dashboard assistant={() => <div>composer</div>} />)
    expect(screen.getByRole("heading", { level: 1, name: "What are you hunting for today?" })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Ask about any of 1,457 vending machines/)).toBeInTheDocument())
    const review = await screen.findByRole("link", { name: /Safeway/ })
    expect(review).toHaveAttribute("href", "/map?location=loc-1")
    expect(screen.getByRole("link", { name: "Manage your reviews" })).toHaveAttribute("href", "/home/reviews")
    expect(await screen.findByText("Card show")).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Upcoming events" })).toHaveTextContent("Sample")
    expect(screen.getByRole("region", { name: "Your submissions" })).toHaveTextContent("Coming soon")
  })

  it("passes a tapped suggestion to the assistant, and the shared location once given", async () => {
    const seen: { suggestion: string | null; viewer: unknown }[] = []
    const getCurrentPosition = vi.fn((ok: PositionCallback) => ok({ coords: { longitude: -122.33789, latitude: 47.61234 } } as GeolocationPosition))
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } })
    render(<Dashboard assistant={(p) => (seen.push({ suggestion: p.suggestion, viewer: p.viewer }), <div>composer</div>)} />)
    const denver = message()(`dashboard.suggestions.${SUGGESTIONS[1]}`)
    fireEvent.click(screen.getByRole("button", { name: denver }))
    expect(seen.at(-1)?.suggestion).toBe(denver)

    fireEvent.click(screen.getByRole("button", { name: "Use my location" }))
    expect(await screen.findByText("42")).toBeInTheDocument()
    // Focus follows to what replaced the button.
    await waitFor(() => expect(screen.getByRole("link", { name: "Open on map" })).toHaveFocus())
    expect(screen.getByRole("link", { name: "Open on map" })).toHaveAttribute("href", "/map?r=10&near=me")
    expect(seen.at(-1)?.viewer).toEqual({ lng: -122.34, lat: 47.61 })
    expect(screen.getByRole("button", { name: "What's closest to me?" })).toBeInTheDocument()
  })

  it("steps the greeting, suggestions and tiles aside while chatting", async () => {
    render(<Dashboard assistant={(p) => <button onClick={() => p.onChattingChange(true)}>start</button>} />)
    fireEvent.click(screen.getByRole("button", { name: "start" }))
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.queryByRole("region", { name: "Near you" })).toBeNull()
  })

  it("starts in the chat layout when there's a saved chat, and switches back if the assistant has none (#346)", () => {
    render(<Dashboard initialChatting assistant={(p) => <button onClick={() => p.onChattingChange(false)}>none saved</button>} />)
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull()
    expect(screen.queryByRole("region", { name: "Near you" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "none saved" }))
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument()
  })

  it("leaves focus alone when the viewer moved on while locating", async () => {
    let answer!: PositionCallback
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition: vi.fn((ok: PositionCallback) => (answer = ok)) } })
    render(<Dashboard assistant={() => <textarea aria-label="composer" />} />)
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }))
    screen.getByRole("textbox", { name: "composer" }).focus()
    await act(async () => answer({ coords: { longitude: -122.3, latitude: 47.6 } } as GeolocationPosition))
    expect(await screen.findByText("42")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: "composer" })).toHaveFocus()
  })

  it("gives up locating when the browser never answers", async () => {
    vi.useFakeTimers()
    vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition: vi.fn() } })
    render(<Dashboard assistant={() => null} />)
    fireEvent.click(screen.getByRole("button", { name: "Use my location" }))
    expect(screen.getByRole("button", { name: "Locating…" })).toBeDisabled()
    act(() => vi.advanceTimersByTime(15_000))
    expect(screen.getByText(/Location is off/)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Use my location" })).toBeEnabled()
    vi.useRealTimers()
  })

  it("says when the reviews or events couldn't load, and still links to the reviews page", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async (url: string) => (url === "/api/locations/aggregates" ? json(ROUTES[url]) : new Response("", { status: 500 }))))
    render(<Dashboard assistant={() => null} />)
    expect(await screen.findByText(/Couldn.t load your reviews/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Manage your reviews" })).toHaveAttribute("href", "/home/reviews")
    expect(await screen.findByText(/Couldn.t load events/)).toBeInTheDocument()
  })

  it("is in Spanish on a Spanish page, with the count formatted for it", async () => {
    render(<Dashboard assistant={() => null} />, { locale: "es" })
    expect(screen.getByRole("heading", { level: 1, name: message("es")("dashboard.greeting") })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/Pregunta por cualquiera de las 1457 máquinas expendedoras/)).toBeInTheDocument())
    expect(screen.getByRole("button", { name: message("es")("dashboard.suggestions.denver") })).toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Tus reseñas" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Usar mi ubicación" })).toBeInTheDocument()
  })
})
