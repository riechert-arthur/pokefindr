import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { SearchXIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/pokefindr/EmptyState"

const meta = { title: "PokeFindr/EmptyState", component: EmptyState, args: { title: "Nothing within 10 mi" } } satisfies Meta<typeof EmptyState>
export default meta
export const NoResults: StoryObj<typeof meta> = {
  args: { icon: SearchXIcon, children: "Try a wider radius or turn on more types.", action: <Button size="sm" variant="outline">Widen to 25 mi</Button>, className: "w-80" },
}
