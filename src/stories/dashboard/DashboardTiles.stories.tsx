import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, type MyReview, type NearState } from "@/components/dashboard/DashboardTiles"
import type { UpcomingEvent } from "@/lib/types/highlights"

/** The four tiles under the assistant on /home, in the dashboard's grid. */
function Tiles({ columns = 4, near = { status: "idle" }, reviews, events }: { columns?: 1 | 2 | 4; near?: NearState; reviews: MyReview[] | "error" | null; events: UpcomingEvent[] | "error" | null }) {
  // Each column about as wide as the dashboard's at that breakpoint (780 px max, 4 columns ≈ 190 px).
  const width = { 1: 340, 2: 520, 4: 780 }[columns]
  const cols = { 1: "grid-cols-1", 2: "grid-cols-2", 4: "grid-cols-4" }[columns]
  return (
    <div className={`grid gap-2.5 ${cols}`} style={{ width }}>
      <NearYouTile near={near} onLocate={() => {}} />
      <ReviewsTile reviews={reviews} />
      <SubmissionsTile />
      <EventsTile events={events} />
    </div>
  )
}

const meta = {
  title: "Dashboard/DashboardTiles",
  component: Tiles,
  parameters: { layout: "padded" },
} satisfies Meta<typeof Tiles>
export default meta
type Story = StoryObj<typeof meta>

const LONG = "Pokémon Center Vending Machine — Westfield Valley Fair Mall, Santa Clara"
const longReviews: MyReview[] = [
  { id: "r1", rating: 4.5, comment: "Restocked on Tuesday mornings, ask at the customer service desk", location: { id: "l1", name: LONG, city: "Santa Clara", state: "CA" } },
  { id: "r2", rating: 5, comment: null, location: { id: "l2", name: "Target — Shops at Northeast Plaza, North Richland Hills", city: "North Richland Hills", state: "TX" } },
  { id: "r3", rating: 2, comment: "Empty", location: { id: "l3", name: "Safeway", city: "Seattle", state: "WA" } },
]
const longEvents: UpcomingEvent[] = [
  { id: "e1", title: "Regional Championship Pre-Release Tournament and Card Swap Meet", startsAt: "2026-11-14T18:00:00Z", endsAt: null, city: "Rancho Cucamonga", state: "CA", lng: -117.59, lat: 34.1, isSample: false },
  { id: "e2", title: "League night", startsAt: "2026-11-20T01:00:00Z", endsAt: "2026-11-20T04:00:00Z", city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: false },
]

const reviews: MyReview[] = [
  { id: "r1", rating: 4, comment: "Stocked Tuesday", location: { id: "l1", name: "Safeway", city: "Seattle", state: "WA" } },
  { id: "r2", rating: 3.5, comment: null, location: { id: "l2", name: "Target", city: "Bellevue", state: "WA" } },
  { id: "r3", rating: 5, comment: "Two machines by the exit", location: { id: "l3", name: "Fred Meyer", city: "Redmond", state: "WA" } },
]
const events: UpcomingEvent[] = [
  { id: "e1", title: "Card show", startsAt: "2026-11-14T18:00:00Z", endsAt: null, city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: true },
  { id: "e2", title: "League night", startsAt: "2026-11-20T01:00:00Z", endsAt: "2026-11-20T04:00:00Z", city: "Boulder", state: "CO", lng: -105.27, lat: 40.01, isSample: true },
]

/** Every tile with content; the events are sample data, so they carry the "Sample" badge. */
export const Filled: Story = { args: { reviews, events } }
/** Before the reviews and events arrive. */
export const Loading: Story = { args: { reviews: null, events: null } }
/** Signed in with nothing yet. */
export const Empty: Story = { args: { reviews: [], events: [] } }
/** The reviews and events couldn't load. */
export const LoadError: Story = { args: { reviews: "error", events: "error" } }
/** Near you after the browser refused the location. */
export const NearDenied: Story = { args: { near: { status: "denied" }, reviews, events } }
/** Near you with the count, and its link to the map. */
export const NearReady: Story = { args: { near: { status: "ready", count: 42 }, reviews, events } }

/** Long place names (#302): each ends in an ellipsis and the stars stay inside the tile. */
export const LongNamesFourColumns: Story = { args: { columns: 4, reviews: longReviews, events: longEvents } }
export const LongNamesTwoColumns: Story = { args: { columns: 2, reviews: longReviews, events: longEvents } }
export const LongNamesOneColumn: Story = { args: { columns: 1, reviews: longReviews, events: longEvents } }
