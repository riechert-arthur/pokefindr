import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { LocateFixedIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const meta = { title: "UI/Tooltip", component: Tooltip } satisfies Meta<typeof Tooltip>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    // The preview's TooltipProvider supplies the delays, as in the app.
    <Tooltip defaultOpen>
      <TooltipTrigger asChild><Button size="icon" variant="outline" aria-label="Show my location"><LocateFixedIcon /></Button></TooltipTrigger>
      <TooltipContent>Show my location</TooltipContent>
    </Tooltip>
  ),
}
