import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Input } from "@/components/ui/input"

const meta = { title: "UI/Input", component: Input, args: { placeholder: "City or address, like Denver, CO", className: "w-80" } } satisfies Meta<typeof Input>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const Disabled: Story = { args: { disabled: true } }
