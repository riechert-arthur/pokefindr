import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen, within } from "../../helpers/intl"
import { CoverageView } from "@/components/admin/CoverageView"
import type { Coverage } from "@/lib/admin/coverage"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const DATA: Coverage = {
  vendingByState: [
    { state: "California", count: 299 },
    { state: "Washington", count: 213 },
  ],
  states: 25,
  byRetailer: [{ retailer: "Safeway", count: 417 }],
  retailers: 30,
  totals: { vending: 1457, shop: 30, event: 5 },
  countries: [
    { name: "United States", count: 1492, status: "live" },
    { name: "Canada", count: 0, status: "next" },
  ],
}

describe("CoverageView", () => {
  it("shows states, totals, retailers and countries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(DATA))))
    render(<CoverageView />)
    const states = await screen.findByRole("list", { name: "Vending machines by state" })
    expect(within(states).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["California299", "Washington213"])
    expect(screen.getByText("Top 12 of 25 states.")).toBeInTheDocument()
    expect(screen.getByText("1,457")).toBeInTheDocument()
    expect(screen.getByText("Top 8 of 30")).toBeInTheDocument()
    const countries = screen.getByRole("list", { name: "Countries" })
    expect(within(countries).getAllByRole("listitem").map((li) => li.textContent)).toEqual(["United StatesLive", "CanadaNext"])
  })
})
