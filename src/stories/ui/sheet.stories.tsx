import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"

const meta = { title: "UI/Sheet", component: Sheet } satisfies Meta<typeof Sheet>
export default meta
export const Left: StoryObj<typeof meta> = {
  render: () => (
    <Sheet>
      <SheetTrigger asChild><Button variant="outline">Open results</Button></SheetTrigger>
      <SheetContent side="left">
        <SheetHeader>
          <SheetTitle>41 places near Seattle, WA</SheetTitle>
          <SheetDescription>Sorted by distance from the city center</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
}
