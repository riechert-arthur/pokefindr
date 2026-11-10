import type { LocationKind } from "./locations"

/** A place in an assistant result card, with what the card and map need. */
export interface AssistantPlace {
  id: string
  name: string
  kind: LocationKind
  address: string
  city: string
  state: string
  lng: number
  lat: number
  /** Straight-line miles from the searched point, when there is one. */
  miles?: number
  /** Seed data, not a real place. */
  sample?: true
}

/** An upcoming event in a card. */
export interface AssistantEvent {
  id: string
  title: string
  /** ISO timestamps. */
  startsAt: string
  endsAt: string | null
  city: string
  state: string
  lng: number
  lat: number
  miles?: number
  sample?: true
}

/**
 * What a tool shows the viewer: the composer renders each as a card (and the
 * route on the map). The model gets a shorter `data` object; cards carry
 * coordinates so the page needn't fetch again.
 */
/**
 * The area a card is about, so the page can write its heading in its own
 * language and units. Cards saved before it existed have only `title`.
 */
export type CardArea = { kind: "state"; label: string } | { kind: "near"; label: string; radiusMiles: number }

/**
 * Each card's `title` is English, for the model's memory of the
 * conversation; the page shows `area` in its language when the card has it.
 */
export type AssistantCard =
  | {
      type: "places"
      title: string
      /** Missing for a single place, whose title is its name. */
      area?: CardArea
      places: AssistantPlace[]
      /** Every match, not just the shown ones. */
      total: number
      /** The searched circle, for "show on map". Null for a state. */
      near: { lng: number; lat: number; label: string; radiusMiles: number } | null
    }
  | {
      type: "route"
      /** In visiting order. */
      stops: AssistantPlace[]
      /** Straight-line miles to each stop from the one before (or the start). */
      legs: number[]
      totalMiles: number
      /** Google Maps driving directions through the stops. */
      mapsUrl: string
      start: { lng: number; lat: number; label: string } | null
    }
  | {
      type: "stats"
      title: string
      area?: CardArea
      total: number
      byKind: Partial<Record<LocationKind, number>>
      topRetailers: { retailer: string; count: number }[]
    }
  /** `area` is null for events anywhere. */
  | { type: "events"; title: string; area?: CardArea | null; events: AssistantEvent[] }
