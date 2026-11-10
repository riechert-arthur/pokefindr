import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect } from "storybook/test"
import { NextIntlClientProvider } from "next-intl"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, type MyReview, type NearState } from "@/components/dashboard/DashboardTiles"
import type { UpcomingEvent } from "@/lib/types/highlights"
import { MESSAGES } from "@/i18n/all-messages"
import { longEvents, longReviews } from "./fixtures"

/** The four tiles under the assistant on /home, in the dashboard's grid. */
function Tiles({ columns, near = { status: "idle" }, reviews, events }: { columns: 1 | 2 | 4; near?: NearState; reviews: MyReview[] | "error" | null; events: UpcomingEvent[] | "error" | null }) {
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
  // Nothing in a tile reaches past its border (#302). jsdom can't lay out, so
  // this is the layout check; it runs in the browser under the test runner.
  play: async ({ canvasElement }) => {
    const outside: string[] = []
    for (const tile of canvasElement.querySelectorAll("section")) {
      const box = tile.getBoundingClientRect()
      for (const el of tile.querySelectorAll("*")) {
        const r = el.getBoundingClientRect()
        if (r.width && (r.left < box.left - 0.5 || r.right > box.right + 0.5)) outside.push(`${tile.getAttribute("aria-label")}: ${el.outerHTML.slice(0, 120)}`)
      }
    }
    await expect(outside).toEqual([])
  },
} satisfies Meta<typeof Tiles>
export default meta
type Story = StoryObj<typeof meta>

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
