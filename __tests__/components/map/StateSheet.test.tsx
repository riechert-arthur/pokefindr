import { describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen } from "../../helpers/intl"
import { StateSheet } from "@/components/map/StateSheet"
import type { StateCitiesState } from "@/components/map/useStateCities"

const KINDS = ["vending", "shop", "event"] as const
const ready = (over: Partial<StateCitiesState> = {}): StateCitiesState => ({
  status: "ready",
  state: "WA",
  cities: {
    cities: [
      { city: "Vancouver", count: 24, lng: -122.6, lat: 45.66 },
      { city: "Seattle", count: 23, lng: -122.33, lat: 47.62 },
    ],
    counts: { vending: 213 },
    total: 213,
  },
  reload: vi.fn(),
  ...over,
})

describe("StateSheet", () => {
  it("shows the state's counts and its busiest cities, and opens one", () => {
    const onCity = vi.fn()
    render(<StateSheet code="WA" name="Washington" kinds={KINDS} data={ready()} onBack={vi.fn()} onCity={onCity} />)
    expect(screen.getByRole("heading", { name: "Washington" })).toBeInTheDocument()
    expect(screen.getByText("213 vending machines")).toBeInTheDocument()
    expect(screen.getAllByRole("listitem").map((li) => li.textContent)).toEqual(["Vancouver24 places", "Seattle23 places"])
    fireEvent.click(screen.getByText("Seattle"))
    expect(onCity).toHaveBeenCalledWith({ city: "Seattle", count: 23, lng: -122.33, lat: 47.62 })
  })

  it("goes back to the US", () => {
    const onBack = vi.fn()
    render(<StateSheet code="WA" name="Washington" kinds={KINDS} data={ready()} onBack={onBack} onCity={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Back to the US" }))
    expect(onBack).toHaveBeenCalled()
  })

  it("never shows another state's cities under this name", () => {
    render(<StateSheet code="OR" name="Oregon" kinds={KINDS} data={ready({ status: "loading" })} onBack={vi.fn()} onCity={vi.fn()} />)
    expect(screen.queryByText("Vancouver")).not.toBeInTheDocument()
    expect(screen.getByLabelText("Loading cities")).toBeInTheDocument()
  })

  it("says when the state has nothing for the shown kinds, and retries after an error", () => {
    const { unmount } = render(
      <StateSheet code="WA" name="Washington" kinds={["shop"]} data={ready({ cities: { cities: [], counts: {}, total: 0 } })} onBack={vi.fn()} onCity={vi.fn()} />,
    )
    expect(screen.getByText("Nothing in Washington yet")).toBeInTheDocument()
    expect(screen.getByText("Nothing here for the selected types")).toBeInTheDocument()
    unmount()
    const reload = vi.fn()
    render(<StateSheet code="WA" name="Washington" kinds={KINDS} data={ready({ status: "error", reload })} onBack={vi.fn()} onCity={vi.fn()} />)
    fireEvent.click(screen.getByRole("button", { name: "Try again" }))
    expect(reload).toHaveBeenCalled()
  })
})
