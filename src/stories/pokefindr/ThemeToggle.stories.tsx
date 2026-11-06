import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"

const meta = {
  title: "PokeFindr/ThemeToggle",
  component: ThemeToggle,
  // The toggle drives the theme here, not the toolbar (see .storybook/preview.tsx).
  parameters: { themeToggle: true },
} satisfies Meta<typeof ThemeToggle>
export default meta
type Story = StoryObj<typeof meta>
export const Segmented: Story = {}
export const Toggle: Story = { args: { variant: "toggle" } }
