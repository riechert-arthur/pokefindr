import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { MapIcon } from "lucide-react"
import { Button } from "@/components/ui/button"

const meta = { title: "UI/Button", component: Button, args: { children: "View full map" } } satisfies Meta<typeof Button>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
export const Outline: Story = { args: { variant: "outline" } }
export const Secondary: Story = { args: { variant: "secondary" } }
export const Ghost: Story = { args: { variant: "ghost", children: "Open map" } }
export const Destructive: Story = { args: { variant: "destructive", children: "Delete review" } }
export const Link: Story = { args: { variant: "link", children: "Learn more" } }
export const WithIcon: Story = { args: { children: <><MapIcon /> Open map</> } }
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-2">
      <Button size="sm">Small</Button>
      <Button>Default</Button>
      <Button size="lg">Large</Button>
      <Button size="icon" aria-label="Map"><MapIcon /></Button>
    </div>
  ),
}
