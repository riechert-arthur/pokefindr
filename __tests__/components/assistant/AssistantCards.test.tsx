import { describe, expect, it } from "vitest"
import { render, screen } from "../../helpers/intl"
import { AssistantCardView } from "@/components/assistant/AssistantCards"

const stop = (id: string, name: string) => ({ id, name, kind: "vending" as const, address: "1 Main", city: "Denver", state: "CO", lng: -104.99, lat: 39.74 })

describe("AssistantCardView", () => {
  it("shows a route in order, with the map and Google Maps links", () => {
    render(<AssistantCardView card={{ type: "route", stops: [stop("a", "Kroger"), stop("b", "King Soopers")], legs: [0, 1.24], totalMiles: 1.24, start: null, mapsUrl: "https://www.google.com/maps/dir/?api=1&origin=1,2&destination=3,4" }} />)
    expect(screen.getByText("Route · 2 stops · 1.2 mi straight-line")).toBeInTheDocument()
    expect(screen.getByText("Start")).toBeInTheDocument()
    expect(screen.getByText("+1.2 mi")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Show on map" })).toHaveAttribute("href", "/map?route=a,b")
    expect(screen.getByRole("link", { name: /Open in Google Maps/ })).toHaveAttribute("href", expect.stringMatching(/^https:\/\/www\.google\.com\/maps\/dir\//))
  })

  it("drops a directions link that isn't Google Maps", () => {
    render(<AssistantCardView card={{ type: "route", stops: [stop("a", "A"), stop("b", "B")], legs: [0, 1], totalMiles: 1, start: null, mapsUrl: "javascript:alert(1)" }} />)
    expect(screen.queryByRole("link", { name: /Google Maps/ })).toBeNull()
  })

  it("opens a 'near me' search as near=me, with the map's radius", () => {
    render(<AssistantCardView card={{ type: "places", title: "2 within 7 mi of you", total: 2, places: [], near: { lng: -104.99, lat: 39.74, label: "you", radiusMiles: 7 } }} />)
    expect(screen.getByText("Nothing matched.")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open this area on the map" })).toHaveAttribute("href", "/map?r=10&near=me")
  })

  it("shows counts per kind and the top retailers", () => {
    render(<AssistantCardView card={{ type: "stats", title: "Colorado", total: 90, byKind: { vending: 88, event: 2 }, topRetailers: [{ retailer: "King Soopers", count: 60 }] }} />)
    expect(screen.getByText("88")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.getByLabelText("Top retailers")).toHaveTextContent("King Soopers60")
  })
})
