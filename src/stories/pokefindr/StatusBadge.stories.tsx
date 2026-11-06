import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { StatusBadge } from "@/components/pokefindr/StatusBadge"

const meta = { title: "PokeFindr/StatusBadge", component: StatusBadge, args: { status: "live" } } satisfies Meta<typeof StatusBadge>
export default meta
type Story = StoryObj<typeof meta>
export const Live: Story = {}
export const All: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <StatusBadge status="live" /><StatusBadge status="sample" /><StatusBadge status="pending" /><StatusBadge status="coming-soon" /><StatusBadge status="sponsored" />
    </div>
  ),
}
