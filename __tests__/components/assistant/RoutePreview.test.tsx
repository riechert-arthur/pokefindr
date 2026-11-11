import { afterEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, render, screen, waitFor } from "../../helpers/intl"
import type { StreetRoute } from "@/lib/types/routes"

const { webgl, crash } = vi.hoisted(() => ({ webgl: { on: true }, crash: { on: false } }))
vi.mock("@/lib/map/webgl", () => ({ hasWebGL: () => webgl.on }))
// The map itself needs WebGL; the preview's own logic is what's under test.
vi.mock("next/dynamic", () => ({
  default: () =>
    function PreviewMap({ route }: { route: StreetRoute }) {
      if (crash.on) throw new Error("WebGL context lost")
      return <div data-testid="preview-map" data-routed={String(route.routed)} />
    },
}))

import { RoutePreview } from "@/components/assistant/RoutePreview"

const A = "00000000-0000-4000-8000-00000000000a"
const B = "00000000-0000-4000-8000-00000000000b"

const route = (overrides: Partial<StreetRoute> = {}): StreetRoute => ({
  routed: true,
  line: { type: "LineString", coordinates: [[-105, 39.7], [-105.1, 39.8]] },
  legs: [{ miles: 9.1, minutes: 23 }],
  miles: 9.1,
  minutes: 23,
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

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  webgl.on = true
  crash.on = false
})

describe("RoutePreview (#349)", () => {
  it("loads the route once and shows it on a map, with the drive's time and distance", async () => {
    const fetchMock = answer(200, route())
    render(<RoutePreview ids={[A, B]} autoOpen />)
    expect(screen.getByRole("figure", { name: "Route preview" })).toBeInTheDocument()
    expect(await screen.findByTestId("preview-map")).toHaveAttribute("data-routed", "true")
    expect(screen.getByText("23 min drive · 9.1 mi")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0][0])).toBe(`/api/route?ids=${A},${B}`)
  })

  it("says when the route is straight lines", async () => {
    answer(200, route({ routed: false, minutes: null, legs: [{ miles: 8, minutes: null }] }))
    render(<RoutePreview ids={[A, B]} autoOpen />)
    expect(await screen.findByTestId("preview-map")).toHaveAttribute("data-routed", "false")
    expect(screen.getByText("Straight lines: couldn't get street directions")).toBeInTheDocument()
  })

  it.each([[404], [503]])("shows nothing when the route answers %i, so the card keeps its stop list", async (status) => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    const fetchMock = answer(status)
    const { container } = render(<RoutePreview ids={[A, B]} autoOpen />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    await waitFor(() => expect(container).toBeEmptyDOMElement())
  })

  it("shows nothing and asks for nothing without WebGL", () => {
    webgl.on = false
    const fetchMock = answer(200, route())
    const { container } = render(<RoutePreview ids={[A, B]} autoOpen />)
    expect(container).toBeEmptyDOMElement()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows it in Spanish on a Spanish page", async () => {
    answer(200, route())
    render(<RoutePreview ids={[A, B]} autoOpen />, { locale: "es" })
    expect(await screen.findByRole("figure", { name: "Vista previa de la ruta" })).toBeInTheDocument()
    expect(screen.getByText(/23 min en auto/)).toBeInTheDocument()
  })

  it("waits for a click on an older route card, then loads it", async () => {
    const fetchMock = answer(200, route())
    render(<RoutePreview ids={[A, B]} autoOpen={false} />)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("button", { name: "Preview route" }))
    expect(await screen.findByTestId("preview-map")).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("says when some stops are gone, since the map's numbers no longer match the list", async () => {
    answer(200, route())
    render(<RoutePreview ids={[A, B, "00000000-0000-4000-8000-00000000000c"]} autoOpen />)
    expect(await screen.findByText("Some stops are gone, so the route skips them.")).toBeInTheDocument()
  })

  it("goes away, without taking the chat with it, when the map crashes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})
    crash.on = true
    answer(200, route())
    const { container } = render(
      <div>
        <RoutePreview ids={[A, B]} autoOpen />
        <p>the rest of the chat</p>
      </div>,
    )
    await waitFor(() => expect(container.querySelector("figure")).toBeNull())
    expect(screen.getByText("the rest of the chat")).toBeInTheDocument()
  })

  it("ignores an answer for ids that have since changed", async () => {
    const C = "00000000-0000-4000-8000-00000000000c"
    let answerFirst!: (r: Response) => void
    const fetchMock = vi.fn<typeof fetch>((url) =>
      String(url).includes(C)
        ? Promise.resolve(new Response(JSON.stringify(route({ minutes: 40 }))))
        : new Promise<Response>((resolve) => (answerFirst = resolve)),
    )
    vi.stubGlobal("fetch", fetchMock)
    const { rerender } = render(<RoutePreview ids={[A, B]} autoOpen />)
    rerender(<RoutePreview ids={[A, C]} autoOpen />)
    expect(await screen.findByText("40 min drive · 9.1 mi")).toBeInTheDocument()
    await act(async () => answerFirst(new Response(JSON.stringify(route({ minutes: 5 })))))
    expect(screen.getByText("40 min drive · 9.1 mi")).toBeInTheDocument()
  })
})
