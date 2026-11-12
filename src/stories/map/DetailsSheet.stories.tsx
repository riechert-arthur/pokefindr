import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { DetailsSheet } from "@/components/map/DetailsSheet"

const SHOP = { id: "shop-1", longitude: -74.0031, latitude: 40.7339, retailer: "Bleecker Trading", address: "96 Christopher St", city: "New York", state: "NY", machineID: "", kind: "shop" }

/** A place's details panel: its kind, name and address, Directions and Copy link, then its facts. */
const meta = {
  title: "Map/DetailsSheet",
  component: DetailsSheet,
  args: { location: SHOP, backLabel: "Back to New York, NY", onBack: fn() },
  decorators: [(Story) => <div className="flex h-[560px] w-[380px] flex-col border border-border bg-card"><Story /></div>],
} satisfies Meta<typeof DetailsSheet>
export default meta
type Story = StoryObj<typeof meta>

/**
 * A card shop with a website (#399) and hours that vary through the week
 * (#401): the hours start collapsed to today's, a click shows the week.
 */
export const ShopWithWebsite: Story = { args: { location: { ...SHOP, website: "https://www.bleeckertrading.com/", hours: "Mo-Th 11:00-19:00; Fr-Sa 11:00-21:00; Su 12:00-18:00" } } }

/** Hours that are the same every day: one line, nothing to expand. */
export const ShopOpenEveryDay: Story = { args: { location: { ...SHOP, website: null, hours: "Mo-Su 10:00-20:00" } } }

/** Hours entered as free text (Add a place), shown as written. */
export const ShopFreeTextHours: Story = { args: { location: { ...SHOP, website: null, hours: "Tues–Sat noon to 7, Sun by appointment" } } }

/** A card shop with neither: no Website or Hours row. */
export const ShopWithoutWebsite: Story = { args: { location: { ...SHOP, website: null, hours: null } } }

/** A vending machine: retailer, address, machine ID and source. */
export const VendingMachine: Story = {
  args: { location: { id: "loc-1", longitude: -122.3207, latitude: 47.6131, retailer: "QFC", address: "1401 Broadway", city: "Seattle", state: "WA", machineID: "Q00350", kind: "vending" }, backLabel: "Back to Seattle, WA" },
}
