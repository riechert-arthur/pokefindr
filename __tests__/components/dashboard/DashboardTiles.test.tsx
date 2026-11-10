import { describe, expect, it } from "vitest"
import { render, screen } from "../../helpers/intl"
import { ReviewsTile } from "@/components/dashboard/DashboardTiles"

const LONG = "Pokémon Center Vending Machine — Westfield Valley Fair Mall, Santa Clara"

describe("ReviewsTile", () => {
  // jsdom doesn't lay out, so this checks the classes that keep the stars inside (#302).
  it("lets a long name truncate and keeps the stars' room in the row", () => {
    render(<ReviewsTile reviews={[{ id: "r1", rating: 4, comment: null, location: { id: "l1", name: LONG, city: "Santa Clara", state: "CA" } }]} />)
    const row = screen.getByRole("link", { name: new RegExp(LONG) })
    const name = screen.getByText(LONG)
    const stars = screen.getByRole("img", { name: /4 out of 5/ })
    expect(row).toContainElement(stars)
    expect(name.parentElement).toBe(stars.parentElement)
    expect(name).toHaveClass("min-w-0", "truncate")
    expect(stars).toHaveClass("shrink-0")
    expect(row).toHaveClass("min-w-0")
    // The tile can't grow past its column, and its rows can't grow past the tile.
    expect(screen.getByRole("region", { name: "Your reviews" })).toHaveClass("min-w-0", "grid-cols-1")
  })
})
