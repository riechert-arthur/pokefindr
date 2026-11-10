import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "../../helpers/intl"
import type { StreetRoute } from "@/lib/types/routes"
import type { MapColors } from "@/components/map/layers"

const { toast, map, layers } = vi.hoisted(() => ({
  toast: Object.assign(vi.fn(), { error: vi.fn() }),
  map: { fitBounds: vi.fn(), getContainer: () => null },
  layers: [] as { paint?: Record<string, unknown> }[],
}))
vi.mock("sonner", () => ({ toast }))
vi.mock("@/components/map/engine", () => ({
  useMap: () => ({ current: map }),
  Source: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  Layer: (props: { paint?: Record<string, unknown> }) => {
    layers.push(props)
    return null
  },
  Marker: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}))

import { RouteOverlay } from "@/components/map/RouteOverlay"

const A = "00000000-0000-4000-8000-00000000000a"
const B = "00000000-0000-4000-8000-00000000000b"
const C = "00000000-0000-4000-8000-00000000000c"

const route = (overrides: Partial<StreetRoute> = {}): StreetRoute => ({
  routed: true,
  // The road bulges west of both stops.
  line: { type: "LineString", coordinates: [[-105, 39.7], [-105.3, 39.75], [-105.1, 39.8]] },
  legs: [{ miles: 9.1, minutes: 14 }],
  miles: 9.1,
  minutes: 14,
  stops: [
    { id: A, retailer: "King Soopers", lng: -105, lat: 39.7 },
    { id: B, retailer: "Target", lng: -105.1, lat: 39.8 },
  ],
  ...overrides,
})

function answer(status: number, body?: unknown) {
  const fetchMock = vi.fn<typeof fetch>(async () => new Response(body === undefined ? null : JSON.stringify(body), { status }))
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

const show = (ids: string[], onClear = vi.fn()) => render(<RouteOverlay ids={ids} colors={{ primary: "#c00" } as MapColors} onClear={onClear} />)

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  layers.length = 0
})

describe("RouteOverlay (#288)", () => {
  it("loads the whole route in one request, draws a solid line along the streets and frames the line", async () => {
    const fetchMock = answer(200, route())
    show([A, B])
    expect(await screen.findByRole("img", { name: "Stop 2: Target" })).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Stop 1: King Soopers" })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/route?ids=${A},${B}`)
    expect(layers.at(-1)!.paint).not.toHaveProperty("line-dasharray")
    expect(map.fitBounds).toHaveBeenCalledWith(
      [
        [-105.3, 39.7],
        [-105, 39.8],
      ],
      expect.anything(),
    )
    expect(toast).toHaveBeenCalledWith("Route on the map", expect.objectContaining({ description: "2 stops, in visiting order." }))
  })

  it("draws the dashed straight line, and says so, when the route couldn't be routed", async () => {
    answer(200, route({ routed: false, line: { type: "LineString", coordinates: [[-105, 39.7], [-105.1, 39.8]] }, minutes: null }))
    show([A, B])
    await screen.findByRole("img", { name: "Stop 2: Target" })
    expect(layers.at(-1)!.paint).toHaveProperty("line-dasharray")
    expect(toast).toHaveBeenCalledWith("Couldn't get street directions, showing straight lines.", expect.anything())
  })

  it("says when some stops are gone", async () => {
    answer(200, route())
    show([A, B, C])
    await screen.findByRole("img", { name: "Stop 2: Target" })
    expect(toast).toHaveBeenCalledWith("Some stops are gone", expect.anything())
  })

  it("clears the route when its places are gone, and keeps it on another failure", async () => {
    answer(404, { error: "Route not found" })
    const onClear = vi.fn()
    show([A, B], onClear)
    await waitFor(() => expect(onClear).toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith("Couldn't show the route", { description: "Its places aren't on the map anymore." })

    answer(500, { error: "boom" })
    const keep = vi.fn()
    vi.spyOn(console, "error").mockImplementation(() => {})
    show([B, A], keep)
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(2))
    expect(keep).not.toHaveBeenCalled()
  })
})
