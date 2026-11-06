import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { ScrollArea } from "@/components/ui/scroll-area"

const meta = { title: "UI/Scroll area", component: ScrollArea } satisfies Meta<typeof ScrollArea>
export default meta
/** Rows are buttons, so keyboard users already reach every row: no extra tab stop. */
export const Results: StoryObj<typeof meta> = {
  render: () => (
    <ScrollArea focusable={false} className="h-48 w-72 rounded-md border">
      <div className="p-3 text-body">
        {Array.from({ length: 20 }, (_, i) => <button key={i} type="button" className="block w-full border-b border-border py-2 text-left last:border-0 hover:text-primary">Safeway · {(i * 0.4 + 0.3).toFixed(1)} mi</button>)}
      </div>
    </ScrollArea>
  ),
}
/** Text only: the viewport itself takes focus so the list can be scrolled from the keyboard. */
export const PlainText: StoryObj<typeof meta> = {
  render: () => (
    <ScrollArea className="h-48 w-72 rounded-md border">
      <div className="p-3 text-body">
        {Array.from({ length: 20 }, (_, i) => <div key={i} className="border-b border-border py-2 last:border-0">Safeway · {(i * 0.4 + 0.3).toFixed(1)} mi</div>)}
      </div>
    </ScrollArea>
  ),
}
