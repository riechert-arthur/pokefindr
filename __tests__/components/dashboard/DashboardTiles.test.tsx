import { describe, expect, it } from "vitest"
import { message, render, screen, within } from "../../helpers/intl"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, TILE_ROWS } from "@/components/dashboard/DashboardTiles"
import type { MyReview } from "@/lib/reviews/my-review"
import type { MySubmission } from "@/lib/submissions/schemas"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { LONG_NAME } from "@/stories/dashboard/fixtures"

const review = (i: number, name = `Place ${i}`): MyReview => ({ id: `r${i}`, rating: 4, comment: null, created: null, status: "published", location: { id: `l${i}`, name, description: null, city: "Santa Clara", state: "CA" } })
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
  it("keeps its manage action while the reviews load, so the footers line up", () => {
    render(<ReviewsTile reviews={null} />)
    expect(screen.getByRole("link", { name: "Manage your reviews" })).toHaveAttribute("href", "/home/reviews")
  })
})

describe("NearYouTile", () => {
  it("announces the button's 'Locating…' as well as the result", () => {
    render(<NearYouTile near={{ status: "locating" }} onLocate={() => {}} />)
    const tile = screen.getByRole("region", { name: "Near you" })
    expect(tile).toHaveAttribute("aria-live", "polite")
    expect(tile).toContainElement(screen.getByRole("button", { name: /Locating/ }))
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
        <SubmissionsTile submissions={[]} />
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

describe("SubmissionsTile (#357)", () => {
  const submission = (over: Partial<MySubmission>): MySubmission => ({ id: "s1", kind: "shop", status: "pending", rejectReason: null, name: "Rose City Card Exchange", address: "1820 SE Hawthorne Blvd", city: "Portland", state: "OR", lng: -122.64, lat: 45.51, startsAt: null, locationId: null, locationActive: null, createdAt: "2026-11-01T18:00:00Z", reviewedAt: null, ...over })

  it("lists each submission with its status: a live one opens its place, a pending one the map around it", () => {
    render(<SubmissionsTile submissions={[submission({ id: "s1" }), submission({ id: "s2", name: "Mile High Cards", status: "approved", locationId: "loc-9", locationActive: true })]} />)
    expect(screen.getByRole("link", { name: /Rose City Card Exchange/ })).toHaveTextContent("Pending review")
    expect(screen.getByRole("link", { name: /Rose City Card Exchange/ }).getAttribute("href")).toMatch(/^\/map\?.*lng=-122\.64/)
    const live = screen.getByRole("link", { name: /Mile High Cards/ })
    expect(live).toHaveTextContent("Live")
    expect(live).toHaveAttribute("href", "/map?location=loc-9")
  })

  it("says why one wasn't approved, and opens the map's list of submissions for it, since it has no pin", () => {
    render(<SubmissionsTile submissions={[submission({ status: "rejected", rejectReason: "duplicate" }), submission({ id: "s3", name: "Card show", kind: "event", status: "approved", locationId: "loc-3", locationActive: false })]} />)
    const rejected = screen.getByRole("link", { name: /Rose City Card Exchange/ })
    expect(rejected).toHaveTextContent("Not approved")
    expect(rejected).toHaveTextContent(message()("map.submissions.rejectReasons.duplicate"))
    expect(rejected).toHaveAttribute("href", "/map")
    const ended = screen.getByRole("link", { name: /Card show/ })
    expect(ended).toHaveTextContent(message()("map.submissions.over"))
    expect(ended).toHaveAttribute("href", "/map")
  })

  it("says what will appear before there's anything, and opens Add a place", () => {
    render(<SubmissionsTile submissions={[]} />)
    expect(screen.getByText(/appear here while they wait for review/)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Add a place" })).toHaveAttribute("href", "/map?add=1")
    expect(screen.queryByText("Coming soon")).not.toBeInTheDocument()
  })
})
