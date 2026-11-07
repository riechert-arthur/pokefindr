import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react"
import { AlsoNearby, useAlsoNearby, type NearbyRow } from "@/components/map/AlsoNearby"

const row = (id: string, retailer: string, distance: number): NearbyRow => ({
  type: "Feature",
  id,
  geometry: { type: "Point", coordinates: [-122.3, 47.6] },
  properties: { id, machineID: "", retailer, address: "1 Main St", city: "Seattle", state: "WA", kind: "vending", distance },
})

afterEach(() => vi.unstubAllGlobals())

describe("useAlsoNearby", () => {
  it("asks for 4 within 5 mi with the map's filters, and leaves the location itself out", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ type: "FeatureCollection", features: [row("self", "QFC", 0), row("b", "Safeway", 0.4), row("c", "Fred Meyer", 1.2), row("d", "QFC", 2)], counts: {}, total: 4, truncated: false })))
    vi.stubGlobal("fetch", fetchMock)
    const { result } = renderHook(() => useAlsoNearby({ id: "self", longitude: -122.32071, latitude: 47.62349 }, ["vending"], ["QFC", "Safeway"]))
    await waitFor(() => expect(result.current).toHaveLength(3))
    expect(result.current.map((f) => f.properties.id)).toEqual(["b", "c", "d"])
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]), "http://localhost")
    expect(Object.fromEntries(url.searchParams)).toEqual({ lng: "-122.3207", lat: "47.6235", r: "5", limit: "4", types: "vending", retailer: "QFC,Safeway" })
  })
})

describe("AlsoNearby", () => {
  it("lists the rows with their distance and opens one", () => {
    const onOpen = vi.fn()
    const rows = [row("b", "Safeway", 0.4), row("c", "Fred Meyer", 1.2)]
    render(<AlsoNearby rows={rows} onOpen={onOpen} />)
    expect(screen.getByRole("heading", { name: "Also nearby" })).toBeInTheDocument()
    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual(["Safeway1 Main St, Seattle0.4 mi", "Fred Meyer1 Main St, Seattle1.2 mi"])
    fireEvent.click(screen.getByText("Fred Meyer"))
    expect(onOpen).toHaveBeenCalledWith(rows[1])
  })

  it("shows nothing without nearby places", () => {
    const { container } = render(<AlsoNearby rows={[]} onOpen={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})
