import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { ScrollArea } from "@/components/ui/scroll-area"

const meta = { title: "UI/Scroll area", component: ScrollArea } satisfies Meta<typeof ScrollArea>
export default meta
export const Results: StoryObj<typeof meta> = {
  render: () => (
    <ScrollArea className="h-48 w-72 rounded-md border">
      <div className="p-3 text-body">
        {Array.from({ length: 20 }, (_, i) => <button key={i} type="button" className="block w-full border-b border-border py-2 text-left last:border-0 hover:text-primary">Safeway · {(i * 0.4 + 0.3).toFixed(1)} mi</button>)}
      </div>
    </ScrollArea>
  ),
}
