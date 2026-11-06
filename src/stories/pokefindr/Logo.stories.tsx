import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Logo } from "@/components/brand/Logo"

const meta = { title: "PokeFindr/Logo", component: Logo, args: { size: 48 } } satisfies Meta<typeof Logo>
export default meta
type Story = StoryObj<typeof meta>
export const Mark: Story = {}
export const Full: Story = { args: { variant: "full" } }
export const Sizes: Story = { render: () => <div className="flex items-end gap-4">{[16, 24, 32, 64].map((s) => <Logo key={s} size={s} />)}</div> }
