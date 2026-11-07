import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { AppRail } from "@/components/pokefindr/AppRail"

const meta = {
  title: "PokeFindr/AppRail",
  component: AppRail,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/map" } } },
  decorators: [(Story) => <div className="flex h-[480px]"><Story /></div>],
} satisfies Meta<typeof AppRail>
export default meta
type Story = StoryObj<typeof meta>

/** On the map, signed out. */
export const OnMap: Story = {}

/** On the dashboard, signed in: Settings appears at the bottom. */
export const SignedIn: Story = {
  args: { signedIn: true },
  parameters: { nextjs: { navigation: { pathname: "/home" } } },
}
