import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect } from "storybook/test"
import { NextIntlClientProvider } from "next-intl"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, type MyReview, type NearState } from "@/components/dashboard/DashboardTiles"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { MESSAGES } from "@/i18n/all-messages"
import { inDays, longEvents, longReviews } from "./fixtures"

/** The four tiles under the assistant on /home, in the dashboard's grid. */
function Tiles({ columns = 4, near = { status: "idle" }, reviews, events }: { columns?: 1 | 2 | 4; near?: NearState; reviews: MyReview[] | "error" | null; events: UpcomingEvent[] | "error" | null }) {
  // The grid's narrowest width at each column count, as in Dashboard.tsx: 748 px
  // (780 px less px-4) for 4 columns, 448 px (a 480 px window) for 2, and 288 px
  // (a 320 px phone) for 1.
  const width = { 1: 288, 2: 448, 4: 748 }[columns]
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
  // Nothing in a tile reaches past its border or out of its own box (#302). jsdom can't lay out, so
  // this is the layout check; it runs in the browser under the test runner.
  play: async ({ canvasElement }) => {
    const outside: string[] = []
    for (const tile of canvasElement.querySelectorAll("section")) {
      const box = tile.getBoundingClientRect()
      for (const el of tile.querySelectorAll("*")) {
        const r = el.getBoundingClientRect()
        // Its box, or its own text running out of its box (truncated text is clipped, so it's fine).
        const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())
        const spills = hasText && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflowX === "visible"
        if (r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5 || spills)) outside.push(`${tile.querySelector("h2")?.textContent}: ${el.outerHTML.slice(0, 120)}`)
      }
    }
    await expect(outside).toEqual([])
  },
} satisfies Meta<typeof Tiles>
export default meta
type Story = StoryObj<typeof meta>

const reviews: MyReview[] = [
  { id: "r1", rating: 4, comment: "Stocked Tuesday", location: { id: "l1", name: "Safeway", city: "Seattle", state: "WA" } },
  { id: "r2", rating: 3.5, comment: null, location: { id: "l2", name: "Target", city: "Bellevue", state: "WA" } },
  { id: "r3", rating: 5, comment: "Two machines by the exit", location: { id: "l3", name: "Fred Meyer", city: "Redmond", state: "WA" } },
]
const events: UpcomingEvent[] = [
  { id: "e1", title: "Card show", startsAt: inDays(3), endsAt: null, city: "Denver", state: "CO", lng: -104.99, lat: 39.74, isSample: true },
  { id: "e2", title: "League night", startsAt: inDays(8), endsAt: inDays(8, 3), city: "Boulder", state: "CO", lng: -105.27, lat: 40.01, isSample: true },
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

/**
 * The widest button, "Buscando tu ubicación…", at 4 columns: it wraps inside
 * the tile. In Spanish whatever the toolbar says, so the play check runs on it.
 */
export const LocatingSpanishFourColumns: Story = {
  args: { columns: 4, near: { status: "locating" }, reviews: longReviews, events: longEvents },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="es" messages={MESSAGES.es} timeZone="UTC">
        <div lang="es" className="contents">
          <Story />
        </div>
      </NextIntlClientProvider>
    ),
  ],
}
