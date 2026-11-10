import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { TabBar } from "@/components/pokefindr/TabBar"

const meta = {
  title: "PokeFindr/TabBar",
  component: TabBar,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/home" } } },
  decorators: [(Story) => <div className="flex h-[200px] max-w-[400px] flex-col justify-end bg-muted/50"><Story /></div>],
} satisfies Meta<typeof TabBar>
export default meta
type Story = StoryObj<typeof meta>

/** Today: Home and Map, on the dashboard. */
export const OnHome: Story = {}

/** With the add flow (R4), for an admin (Moderate and Admin), on the map. */
export const AllTabs: Story = {
  args: { canAdd: true, canModerate: true, isAdmin: true },
  parameters: { nextjs: { navigation: { pathname: "/map" } } },
}
