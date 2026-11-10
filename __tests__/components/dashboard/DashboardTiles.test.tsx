import { describe, expect, it } from "vitest"
import { render, screen, within } from "../../helpers/intl"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, TILE_ROWS, type MyReview } from "@/components/dashboard/DashboardTiles"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { LONG_NAME } from "@/stories/dashboard/fixtures"

const review = (i: number, name = `Place ${i}`): MyReview => ({ id: `r${i}`, rating: 4, comment: null, location: { id: `l${i}`, name, city: "Santa Clara", state: "CA" } })
const event = (i: number): UpcomingEvent => ({ id: `e${i}`, title: `Event ${i}`, startsAt: "2026-11-14T18:00:00Z", endsAt: null, city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: false })

describe("ReviewsTile", () => {
  // jsdom doesn't lay out, so this only checks the structure and the classes the
  // fix rests on (#302). The Dashboard/DashboardTiles stories' play check
  // measures the real layout in a browser.
  it("lets a long name truncate and keeps the stars' room in the row", () => {
    render(<ReviewsTile reviews={[review(1, LONG_NAME)]} />)
    const row = screen.getByRole("link", { name: (name) => name.includes(LONG_NAME) })
    const stars = screen.getByRole("img", { name: /4 out of 5/ })
    expect(row).toContainElement(stars)
    expect(screen.getByText(LONG_NAME)).toHaveClass("truncate")
    expect(stars).toHaveClass("shrink-0")
    expect(screen.getByText("Santa Clara, CA")).toHaveClass("truncate")
    // A minmax(0, 1fr) track: the rows can't widen the tile.
    expect(row.parentElement).toHaveClass("grid-cols-1")
  })

  it("shows the whole name on hover once it's cut short", () => {
    render(<ReviewsTile reviews={[review(1, LONG_NAME)]} />)
    expect(screen.getByText(LONG_NAME)).toHaveAttribute("title", LONG_NAME)
  })

  it(`lists at most ${TILE_ROWS} reviews, with the manage action in the footer`, () => {
    render(<ReviewsTile reviews={[1, 2, 3, 4, 5].map((i) => review(i))} />)
    expect(screen.getAllByRole("link", { name: /Place/ })).toHaveLength(TILE_ROWS)
    expect(screen.getByRole("link", { name: "Manage your reviews" })).toHaveAttribute("href", "/home/reviews")
  })
})

describe("EventsTile", () => {
  it(`lists at most ${TILE_ROWS} events, and links to the events on the map`, () => {
    render(<EventsTile events={[1, 2, 3, 4].map(event)} />)
    expect(screen.getAllByRole("link", { name: /Event \d/ })).toHaveLength(TILE_ROWS)
    expect(screen.getByRole("link", { name: "See events on map" })).toHaveAttribute("href", "/map?types=event")
  })
})

describe("tiles", () => {
  it("share one layout: an h2 naming the region, a body and a footer action", () => {
    render(
      <>
        <NearYouTile near={{ status: "idle" }} onLocate={() => {}} />
        <ReviewsTile reviews={[review(1)]} />
        <SubmissionsTile />
        <EventsTile events={[event(1)]} />
      </>,
    )
    const tiles = screen.getAllByRole("region")
    expect(tiles.map((t) => within(t).getByRole("heading", { level: 2 }).textContent)).toEqual(["Near you", "Your reviews", "Your submissions", "Upcoming events"])
    for (const tile of tiles) {
      // The footer is the tile's last child, holding one outline action.
      const footer = tile.lastElementChild as HTMLElement
      expect(footer.querySelectorAll("a, button")).toHaveLength(1)
    }
  })
})
