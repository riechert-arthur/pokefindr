import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { UserMenu } from "@/components/pokefindr/UserMenu"

const meta = { title: "PokeFindr/UserMenu", component: UserMenu, args: { size: 40, userName: "misty" } } satisfies Meta<typeof UserMenu>
export default meta
export const Default: StoryObj<typeof meta> = {}
