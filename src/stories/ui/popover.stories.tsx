import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

const meta = { title: "UI/Popover", component: Popover } satisfies Meta<typeof Popover>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <Popover>
      <PopoverTrigger asChild><Button variant="outline">Filters</Button></PopoverTrigger>
      <PopoverContent className="text-body">Retailer filters go here.</PopoverContent>
    </Popover>
  ),
}
