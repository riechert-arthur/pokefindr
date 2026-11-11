import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { AssistantCardView } from "@/components/assistant/AssistantCards"
import type { AssistantCard } from "@/lib/types/assistant"
import type { StreetRoute } from "@/lib/types/routes"

const A = "00000000-0000-4000-8000-0000000000a1"
const B = "00000000-0000-4000-8000-0000000000b2"
const C = "00000000-0000-4000-8000-0000000000c3"

const card: Extract<AssistantCard, { type: "route" }> = {
  type: "route",
  stops: [
    { id: A, name: "King Soopers", kind: "vending", address: "1155 E 9th Ave", city: "Denver", state: "CO", lng: -104.973, lat: 39.731 },
    { id: B, name: "Target", kind: "vending", address: "1985 S Colorado Blvd", city: "Denver", state: "CO", lng: -104.94, lat: 39.68 },
    { id: C, name: "Walmart Supercenter", kind: "vending", address: "7800 Smith Rd", city: "Denver", state: "CO", lng: -104.9, lat: 39.77 },
  ],
  legs: [0, 3.8, 6.4],
  totalMiles: 10.2,
  start: null,
  mapsUrl: "https://www.google.com/maps/dir/?api=1&origin=39.731,-104.973&destination=39.77,-104.9",
}

const stops = card.stops.map((s) => ({ id: s.id, retailer: s.name, lng: s.lng, lat: s.lat }))

/** A drive that follows the streets (a few corners, not the real roads). */
const routed: StreetRoute = {
  routed: true,
  line: { type: "LineString", coordinates: [[-104.973, 39.731], [-104.973, 39.7], [-104.94, 39.7], [-104.94, 39.68], [-104.92, 39.68], [-104.92, 39.75], [-104.9, 39.77]] },
  legs: [{ miles: 4.6, minutes: 12 }, { miles: 7.9, minutes: 15 }],
  miles: 12.5,
  minutes: 27,
  stops,
}

const straight: StreetRoute = {
  routed: false,
  line: { type: "LineString", coordinates: stops.map((s) => [s.lng, s.lat] as [number, number]) },
  legs: [{ miles: 3.8, minutes: null }, { miles: 6.4, minutes: null }],
  miles: 10.2,
  minutes: null,
  stops,
}

/** Answers /api/route in the browser; everything else (map tiles) goes through. */
function stubRouteApi(answer: () => Response) {
  const real = window.fetch
  window.fetch = async (input, init) => {
    const url = new URL(String(input instanceof Request ? input.url : input), window.location.origin)
    return url.pathname === "/api/route" ? answer() : real(input, init)
  }
  return () => {
    window.fetch = real
  }
}

/** The assistant's route card (#349): the route on a small map, then the stops in order. */
const meta = {
  title: "Dashboard/RouteCard",
  component: AssistantCardView,
  parameters: { layout: "padded" },
  args: { card, newestRoute: true },
  decorators: [(Story) => <div style={{ width: 420 }}>{Story()}</div>],
} satisfies Meta<typeof AssistantCardView>

export default meta
type Story = StoryObj<typeof meta>

export const AlongTheStreets: Story = { beforeEach: () => stubRouteApi(() => Response.json(routed)) }

/** Routing failed or isn't set up: a dashed line, and the card says so. */
export const StraightLines: Story = { beforeEach: () => stubRouteApi(() => Response.json(straight)) }

/** An older route card in the conversation: its preview waits for a click. */
export const OlderRoute: Story = { args: { newestRoute: false }, beforeEach: () => stubRouteApi(() => Response.json(routed)) }

/** The route couldn't load: no map, just the stops. */
export const RouteUnavailable: Story = { beforeEach: () => stubRouteApi(() => new Response("", { status: 503 })) }
