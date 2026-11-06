import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { SponsoredSlot } from "@/components/pokefindr/SponsoredSlot"

const meta = {
  title: "PokeFindr/SponsoredSlot",
  component: SponsoredSlot,
  args: { sponsor: "Sample sponsor", title: "Missed the restock? Buy singles online", body: "10% off qualifying purchases with our card marketplace partner.", cta: "See the deal", href: "https://example.com", onDismiss: () => {} },
} satisfies Meta<typeof SponsoredSlot>
export default meta
type Story = StoryObj<typeof meta>
export const Compact: Story = { args: { className: "w-80" } }
export const Strip: Story = { args: { variant: "strip", className: "w-[44rem]" } }
