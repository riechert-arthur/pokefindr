import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"

const meta = { title: "UI/Toggle group", component: ToggleGroup } satisfies Meta<typeof ToggleGroup>
export default meta
export const Radius: StoryObj<typeof meta> = {
  args: { type: "single", defaultValue: "10", variant: "outline" },
  render: (args) => (
    <ToggleGroup {...args} aria-label="Search radius">
      {["5", "10", "25", "50"].map((r) => <ToggleGroupItem key={r} value={r} className="tabular-nums">{r} mi</ToggleGroupItem>)}
    </ToggleGroup>
  ),
}
