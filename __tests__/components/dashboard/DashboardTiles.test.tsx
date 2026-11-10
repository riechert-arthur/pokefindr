import { describe, expect, it } from "vitest"
import { render, screen, within } from "../../helpers/intl"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, TILE_ROWS, type MyReview } from "@/components/dashboard/DashboardTiles"
import type { UpcomingEvent } from "@/lib/types/highlights"

const LONG = "Pokémon Center Vending Machine — Westfield Valley Fair Mall, Santa Clara"
const review = (i: number, name = `Place ${i}`): MyReview => ({ id: `r${i}`, rating: 4, comment: null, location: { id: `l${i}`, name, city: "Santa Clara", state: "CA" } })
const event = (i: number): UpcomingEvent => ({ id: `e${i}`, title: `Event ${i}`, startsAt: "2026-11-14T18:00:00Z", endsAt: null, city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: false })

describe("ReviewsTile", () => {
  // jsdom doesn't lay out, so this checks the classes that keep the stars inside (#302).
  it("lets a long name truncate and keeps the stars' room in the row", () => {
    render(<ReviewsTile reviews={[review(1, LONG)]} />)
    const row = screen.getByRole("link", { name: new RegExp(LONG) })
    const stars = screen.getByRole("img", { name: /4 out of 5/ })
    expect(row).toContainElement(stars)
    expect(screen.getByText(LONG)).toHaveClass("truncate")
    expect(stars).toHaveClass("shrink-0")
    expect(screen.getByText("Santa Clara, CA")).toHaveClass("min-w-0", "truncate")
    expect(row).toHaveClass("min-w-0")
    // The tile can't grow past its column, and its rows can't grow past the tile.
    const tile = screen.getByRole("region", { name: "Your reviews" })
    expect(tile).toHaveClass("min-w-0")
    expect(row.parentElement).toHaveClass("min-w-0", "grid-cols-1")
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
