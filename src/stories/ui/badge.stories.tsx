import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Badge } from "@/components/ui/badge"

const meta = { title: "UI/Badge", component: Badge, args: { children: "New" } } satisfies Meta<typeof Badge>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Secondary: Story = { args: { variant: "secondary" } }
export const Outline: Story = { args: { variant: "outline", children: "Sample" } }
export const Destructive: Story = { args: { variant: "destructive", children: "Gone" } }
