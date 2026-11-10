import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
import { UsSheet } from "@/components/map/UsSheet"
import type { Highlights } from "@/lib/types/highlights"

const HIGHLIGHTS: Highlights = {
  hotspots: [{ city: "Portland", state: "OR", lng: -122.65, lat: 45.52, count: 102 }],
  events: [{ id: "e1", title: "Card show", startsAt: "2026-12-06T18:00:00Z", endsAt: null, city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: true }],
}
const STATES = [
  { code: "CA", count: 299 },
  { code: "WA", count: 213 },
  { code: "VT", count: 0 },
]
const ALL = ["vending", "shop", "event"] as const

function renderSheet(kinds: readonly ("vending" | "shop" | "event")[] = ALL) {
  const handlers = { onHotspot: vi.fn(), onEvent: vi.fn(), onState: vi.fn() }
  render(<UsSheet highlights={HIGHLIGHTS} states={STATES} kinds={kinds} {...handlers} />)
  return handlers
}

describe("UsSheet", () => {
  it("lists hotspots, events (labelled as samples) and the states with locations", () => {
    renderSheet()
    expect(screen.getByRole("heading", { name: "Across the US" })).toBeInTheDocument()
    expect(screen.getByText("102 vending machines within 15 mi")).toBeInTheDocument()
    expect(screen.getByText("Sun, Dec 6 · Denver")).toBeInTheDocument()
    expect(screen.getByText("Sample data")).toBeInTheDocument()
    expect(screen.getByText("299 places")).toBeInTheDocument()
    expect(screen.queryByText("Vermont")).not.toBeInTheDocument()
  })

  it("opens what's clicked", () => {
    const { onHotspot, onEvent, onState } = renderSheet()
    fireEvent.click(screen.getByText("Portland, OR"))
    expect(onHotspot).toHaveBeenCalledWith(HIGHLIGHTS.hotspots[0])
    fireEvent.click(screen.getByText("Card show"))
    expect(onEvent).toHaveBeenCalledWith(HIGHLIGHTS.events[0])
    fireEvent.click(screen.getByText("Washington"))
    expect(onState).toHaveBeenCalledWith("WA")
  })

  it("hides the sections for kinds that are off", () => {
    renderSheet(["shop"])
    expect(screen.queryByRole("region", { name: "Vending hotspots" })).not.toBeInTheDocument()
    expect(screen.queryByRole("region", { name: "Upcoming events" })).not.toBeInTheDocument()
    expect(screen.getByRole("region", { name: "Most locations" })).toBeInTheDocument()
  })
})
