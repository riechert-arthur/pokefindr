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

  it("labels a route in Spanish on a Spanish page", () => {
    render(<AssistantCardView card={{ type: "route", stops: [stop("a", "Kroger"), stop("b", "King Soopers")], legs: [0, 1.24], totalMiles: 1.24, start: null, mapsUrl: "https://www.google.com/maps/dir/?api=1&origin=1,2&destination=3,4" }} />, { locale: "es" })
    expect(screen.getByText("Ruta · 2 paradas · 1,2 mi en línea recta")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Mostrar en el mapa" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Abrir en Google Maps" })).toBeInTheDocument()
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

  it("writes a card's heading in the page's language and units, from its area", () => {
    const card = { type: "places" as const, title: "1,457 within 15 mi of Denver, CO", total: 1457, places: [], near: null, area: { kind: "near" as const, label: "Denver, CO", radiusMiles: 15 } }
    render(<AssistantCardView card={card} />)
    expect(screen.getByRole("heading", { name: "1,457 within 15 mi of Denver, CO" })).toBeInTheDocument()
    render(<AssistantCardView card={card} />, { locale: "es" })
    expect(screen.getByRole("heading", { name: "1457 a menos de 15 mi de Denver, CO" })).toBeInTheDocument()
    render(<AssistantCardView card={{ type: "events", title: "Events within 7 mi of you", area: { kind: "near", label: "you", radiusMiles: 7 }, events: [] }} />, { locale: "es" })
    expect(screen.getByRole("heading", { name: "Eventos a menos de 7 mi de ti" })).toBeInTheDocument()
    render(<AssistantCardView card={{ type: "events", title: "Upcoming events", area: null, events: [] }} />, { locale: "es" })
    expect(screen.getByRole("heading", { name: "Próximos eventos" })).toBeInTheDocument()
  })

  it("keeps the English title of a card saved without its area", () => {
    render(<AssistantCardView card={{ type: "stats", title: "Within 15 mi of Denver", total: 0, byKind: {}, topRetailers: [] }} />, { locale: "es" })
    expect(screen.getByRole("heading", { name: "Within 15 mi of Denver" })).toBeInTheDocument()
  })

  it("shows counts per kind and the top retailers", () => {
    render(<AssistantCardView card={{ type: "stats", title: "Colorado", total: 90, byKind: { vending: 88, event: 2 }, topRetailers: [{ retailer: "King Soopers", count: 60 }] }} />)
    expect(screen.getByText("88")).toBeInTheDocument()
    expect(screen.getByText("0")).toBeInTheDocument()
    expect(screen.getByLabelText("Top retailers")).toHaveTextContent("King Soopers60")
  })
})
