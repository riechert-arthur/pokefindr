import { describe, expect, it } from "vitest"
import { render, screen } from "../../helpers/intl"
import { ReviewsTile } from "@/components/dashboard/DashboardTiles"
import { LONG_NAME, longReviews } from "@/stories/dashboard/fixtures"

describe("ReviewsTile", () => {
  // jsdom doesn't lay out, so this only checks the structure and the classes the
  // fix rests on (#302). The Dashboard/DashboardTiles stories' play check
  // measures the real layout in a browser.
  it("lets a long name truncate and keeps the stars' room in the row", () => {
    render(<ReviewsTile reviews={longReviews.slice(0, 1)} />)
    const row = screen.getByRole("link", { name: (name) => name.includes(LONG_NAME) })
    const name = screen.getByText(LONG_NAME)
    const stars = screen.getByRole("img", { name: /4.5 out of 5/ })
    expect(row).toContainElement(stars)
    expect(name.parentElement).toBe(stars.parentElement)
    expect(name).toHaveClass("truncate")
    expect(stars).toHaveClass("shrink-0")
    // A minmax(0, 1fr) track: the rows can't widen the tile.
    expect(screen.getByRole("region", { name: "Your reviews" })).toHaveClass("grid-cols-1")
  })

  it("shows the whole name on hover once it's cut short", () => {
    render(<ReviewsTile reviews={longReviews.slice(0, 1)} />)
    expect(screen.getByText(LONG_NAME)).toHaveAttribute("title", LONG_NAME)
  })
})
