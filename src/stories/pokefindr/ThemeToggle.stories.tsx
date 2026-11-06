import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { ThemeProvider } from "@/components/providers/ThemeProvider"
import { ThemeToggle } from "@/components/pokefindr/ThemeToggle"

const meta = {
  title: "PokeFindr/ThemeToggle",
  component: ThemeToggle,
  decorators: [(Story) => <ThemeProvider storageKey="storybook-theme"><Story /></ThemeProvider>],
} satisfies Meta<typeof ThemeToggle>
export default meta
type Story = StoryObj<typeof meta>
export const Segmented: Story = {}
export const Cycle: Story = { args: { variant: "cycle" } }
