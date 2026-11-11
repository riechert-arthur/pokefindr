import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "../../helpers/intl"
import type { AssistantEvent } from "@/lib/types/assistant-stream"

vi.mock("@/lib/map/webgl", () => ({ hasWebGL: () => true }))
vi.mock("next/dynamic", () => ({ default: () => () => <div data-testid="preview-map" /> }))

import { AssistantChat } from "@/components/assistant/AssistantChat"

const stop = (id: string, name: string) => ({ id, name, kind: "vending" as const, address: "1 Main", city: "Denver", state: "CO", lng: -104.99, lat: 39.74 })
const A = "00000000-0000-4000-8000-00000000000a"
const B = "00000000-0000-4000-8000-00000000000b"
const C = "00000000-0000-4000-8000-00000000000c"
const routeCard = (ids: string[]): AssistantEvent => ({ type: "card", card: { type: "route", stops: ids.map((id) => stop(id, id.slice(-1))), legs: ids.map(() => 1), totalMiles: 2, start: null, mapsUrl: "https://www.google.com/maps/dir/?api=1" } })
const done: AssistantEvent = { type: "done", stop: "end_turn", memory: "ok", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0, costMicros: 1 }, model: "claude-opus-5-5", turnId: "t" }
const ndjson = (events: AssistantEvent[]) => new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n")
const streetRoute = { routed: true, line: { type: "LineString", coordinates: [[0, 0], [1, 1]] }, legs: [{ miles: 1, minutes: 2 }], miles: 1, minutes: 2, stops: [] }

afterEach(() => vi.unstubAllGlobals())

describe("route previews in the chat (#349)", () => {
  it("opens only the newest route's map; older ones wait for a click", async () => {
    const answers = [ndjson([routeCard([A, B]), done]), ndjson([routeCard([B, C]), done])]
    const fetchMock = vi.fn(async (url: string) => (url === "/api/assistant" ? answers.shift()! : new Response(JSON.stringify({ ...streetRoute, stops: [{ id: A }, { id: B }] }))))
    vi.stubGlobal("fetch", fetchMock)
    render(<AssistantChat viewer={null} suggestion={null} onSuggestionUsed={vi.fn()} onChattingChange={vi.fn()} />)
    const box = screen.getByRole("textbox", { name: "Message the assistant" })
    const ask = (q: string) => {
      fireEvent.change(box, { target: { value: q } })
      fireEvent.keyDown(box, { key: "Enter" })
    }

    ask("route through A and B")
    await screen.findByTestId("preview-map")
    await waitFor(() => expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument())
    ask("now B and C")
    await waitFor(() => expect(screen.getByRole("button", { name: "Preview route" })).toBeInTheDocument())
    expect(screen.getAllByRole("figure", { name: "Route preview" })).toHaveLength(1)
    const routeRequests = () => fetchMock.mock.calls.filter(([url]) => url.startsWith("/api/route")).map(([url]) => url)
    await waitFor(() => expect(routeRequests()).toEqual([`/api/route?ids=${A},${B}`, `/api/route?ids=${B},${C}`]))
  })
})
