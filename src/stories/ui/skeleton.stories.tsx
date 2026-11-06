import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Skeleton } from "@/components/ui/skeleton"

const meta = { title: "UI/Skeleton", component: Skeleton } satisfies Meta<typeof Skeleton>
export default meta
export const ResultRow: StoryObj<typeof meta> = {
  render: () => (
    <div className="flex w-80 items-center gap-3">
      <Skeleton className="size-6 rounded-full" />
      <div className="flex-1 space-y-1.5">
        <Skeleton className="h-3.5 w-1/2" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  ),
}
