import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Button } from "@/components/ui/button"
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"

// Storybook 10 sets the starting viewport through globals.
const meta = { title: "UI/Drawer", component: Drawer, globals: { viewport: { value: "mobile1", isRotated: false } } } satisfies Meta<typeof Drawer>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <Drawer>
      <DrawerTrigger asChild><Button variant="outline">Open details</Button></DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>QFC</DrawerTitle>
          <DrawerDescription>1401 Broadway, Seattle, WA</DrawerDescription>
        </DrawerHeader>
      </DrawerContent>
    </Drawer>
  ),
}
