import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { MapFilterRow } from "@/components/map/MapFilterRow"

const RETAILERS = [
  { retailer: "Safeway", count: 417 },
  { retailer: "Kroger", count: 263 },
  { retailer: "Fred Meyer", count: 131 },
]

/** The filter row across the top of the map (#361), on a map-colored strip as wide as the space right of the panel. */
const meta = {
  title: "Map/MapFilterRow",
  component: MapFilterRow,
  parameters: { layout: "padded" },
  args: { radius: null, onRadiusChange: fn(), vendingShown: true, retailers: [], onRetailersChange: fn() },
  decorators: [
    (Story) => (
      <div className="w-[640px] max-w-full rounded-lg bg-muted p-2">
        <Story />
      </div>
    ),
  ],
  // The Retailer chip loads its list when opened.
  beforeEach: () => {
    const real = window.fetch
    window.fetch = async (input, init) => {
      const url = new URL(String(input instanceof Request ? input.url : input), window.location.origin)
      return url.pathname === "/api/locations/retailers" ? new Response(JSON.stringify({ retailers: RETAILERS })) : real(input, init)
    }
    return () => {
      window.fetch = real
    }
  },
} satisfies Meta<typeof MapFilterRow>
export default meta
type Story = StoryObj<typeof meta>

/** Every kind on, nothing searched: the vending machines' Retailer chip. */
export const AllKinds: Story = {}
/** A place is searched: the radius comes first. */
export const WithPlace: Story = { args: { radius: 10 } }
/** One retailer picked: the chip turns solid and names it, and Clear filters appears. */
export const RetailerPicked: Story = { args: { radius: 10, retailers: ["Safeway"] } }
/** Several picked: the chip counts them. */
export const RetailersPicked: Story = { args: { retailers: ["Safeway", "Kroger"] } }
/** Vending machines off with a place searched: only the radius. */
export const VendingOff: Story = { args: { radius: 25, vendingShown: false } }
/** Vending machines off and nothing searched: no row at all. */
export const NothingApplies: Story = { args: { vendingShown: false } }
