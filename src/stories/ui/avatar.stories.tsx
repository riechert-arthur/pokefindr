import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

const meta = { title: "UI/Avatar", component: Avatar } satisfies Meta<typeof Avatar>
export default meta
export const Fallback: StoryObj<typeof meta> = {
  render: () => (
    <Avatar>
      <AvatarFallback className="bg-brand font-semibold text-primary-foreground">M</AvatarFallback>
    </Avatar>
  ),
}
