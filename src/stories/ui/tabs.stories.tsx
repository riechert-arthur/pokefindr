import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

const meta = { title: "UI/Tabs", component: Tabs } satisfies Meta<typeof Tabs>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <Tabs defaultValue="results" className="w-80">
      <TabsList>
        <TabsTrigger value="results">Results</TabsTrigger>
        <TabsTrigger value="highlights">Highlights</TabsTrigger>
      </TabsList>
      <TabsContent value="results" className="text-body">41 places near Seattle</TabsContent>
      <TabsContent value="highlights" className="text-body">Hotspots and events</TabsContent>
    </Tabs>
  ),
}
