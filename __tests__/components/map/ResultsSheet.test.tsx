import { describe, expect, it, vi } from "vitest"
import { formatFor, cleanup, fireEvent, render, screen, within } from "../../helpers/intl"
import { breakdown, ResultsSheet } from "@/components/map/ResultsSheet"
import type { NearbyLocations } from "@/lib/types/locations"
import type { NearbyState } from "@/components/map/useNearbyLocations"

const feature = (id: string, retailer: string, distance: number, kind: "vending" | "shop" = "vending") => ({
  type: "Feature" as const,
  id,
  geometry: { type: "Point" as const, coordinates: [-122.32, 47.62] },
  properties: { id, machineID: id, retailer, address: "417 Broadway E", city: "Seattle", state: "WA", kind, distance },
})

const RESULTS: NearbyLocations = {
  type: "FeatureCollection",
  features: [feature("a", "QFC", 0.39), feature("b", "Card shop", 0.61, "shop"), feature("c", "Safeway", 3.27)],
  counts: { vending: 2, shop: 1 },
  total: 3,
  truncated: false,
}

const state = (over: Partial<NearbyState> = {}): NearbyState => ({ status: "ready", results: RESULTS, reload: vi.fn(), ...over })
const KINDS = ["vending", "shop", "event"] as const

function renderSheet(props: Partial<Parameters<typeof ResultsSheet>[0]> = {}) {
  const onRadiusChange = vi.fn()
  const onOpen = vi.fn()
  render(<ResultsSheet label="Seattle, WA" radius={10} onRadiusChange={onRadiusChange} kinds={KINDS} nearby={state()} onOpen={onOpen} {...props} />)
  return { onRadiusChange, onOpen }
}

describe("ResultsSheet", () => {
  it("says how many places are near, by kind, and lists them closest first", () => {
    renderSheet()
    expect(screen.getByRole("heading", { name: "3 places near Seattle, WA" })).toBeInTheDocument()
    expect(screen.getByText("2 vending machines · 1 card shop")).toBeInTheDocument()
    const rows = within(screen.getByRole("list")).getAllByRole("button")
    expect(rows.map((r) => r.textContent)).toEqual([
      "QFC417 Broadway E, Seattle0.4 mi",
      "Card shop417 Broadway E, Seattle0.6 mi",
      "Safeway417 Broadway E, Seattle3.3 mi",
    ])
  })

  it("names the kind when only one is shown, and says 'near you' for the viewer", () => {
    renderSheet({ label: null, kinds: ["vending"], nearby: state({ results: { ...RESULTS, total: 2, counts: { vending: 2 } } }) })
    expect(screen.getByRole("heading", { name: "2 vending machines near you" })).toBeInTheDocument()
  })

  it("changes the radius and opens a row", () => {
    const { onRadiusChange, onOpen } = renderSheet()
    expect(screen.getByRole("radio", { name: "10 mi" })).toHaveAttribute("aria-checked", "true")
    fireEvent.click(screen.getByRole("radio", { name: "25 mi" }))
    expect(onRadiusChange).toHaveBeenCalledWith(25)
    fireEvent.click(screen.getByText("Safeway"))
    expect(onOpen).toHaveBeenCalledWith(RESULTS.features[2])
  })

  it("marks the selected location", () => {
    renderSheet({ selectedId: "b" })
    expect(screen.getByText("Card shop").closest("button")).toHaveAttribute("aria-current", "true")
  })

  it("offers a wider radius when nothing is inside", () => {
    const { onRadiusChange } = renderSheet({ radius: 5, nearby: state({ results: { ...RESULTS, features: [], counts: {}, total: 0 } }) })
    expect(screen.getByText("Nothing within 5 mi")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Widen to 10 mi" }))
    expect(onRadiusChange).toHaveBeenCalledWith(10)
  })

  it("shows placeholders while the first results load, and a retry after an error", () => {
    const reload = vi.fn()
    const { unmount } = render(
      <ResultsSheet label="Seattle, WA" radius={10} onRadiusChange={vi.fn()} kinds={KINDS} nearby={state({ status: "loading", results: null })} onOpen={vi.fn()} />,
    )
    expect(screen.getByLabelText("Loading results")).toBeInTheDocument()
    unmount()
    renderSheet({ nearby: state({ status: "error", reload }) })
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reload).toHaveBeenCalled()
  })

  it("shows no counts for results of another radius or filter, and no early 'Nothing within'", () => {
    renderSheet({ radius: 25, nearby: state({ status: "error", stale: true }) })
    expect(screen.getByRole("heading", { name: "Places near Seattle, WA" })).toBeInTheDocument()
    expect(screen.queryByText("2 vending machines · 1 card shop")).not.toBeInTheDocument()
    cleanup()
    renderSheet({ radius: 25, nearby: state({ status: "loading", stale: true, results: { ...RESULTS, features: [], counts: {}, total: 0 } }) })
    expect(screen.queryByText("Nothing within 25 mi")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Loading results")).toBeInTheDocument()
  })

  it("says when the list is cut", () => {
    renderSheet({ nearby: state({ results: { ...RESULTS, total: 1234, truncated: true } }) })
    expect(screen.getByText("Showing the closest 3 of 1,234.")).toBeInTheDocument()
  })
})

describe("breakdown", () => {
  it("lists the shown kinds that have results, in kind order", () => {
    expect(breakdown({ shop: 1, vending: 41 }, KINDS, formatFor())).toBe("41 vending machines · 1 card shop")
    expect(breakdown({ shop: 1, vending: 41 }, ["shop"], formatFor())).toBe("1 card shop")
  })
})
