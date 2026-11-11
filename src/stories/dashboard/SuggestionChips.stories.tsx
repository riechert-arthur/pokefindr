import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { SuggestionChips } from "@/components/assistant/Suggestions"

/** One-tap questions, on /home and an empty /chat (#391). */
const meta = {
  title: "Dashboard/SuggestionChips",
  component: SuggestionChips,
  args: { located: false, onPick: fn() },
  decorators: [(Story) => <div className="mx-auto max-w-[780px] p-4"><Story /></div>],
} satisfies Meta<typeof SuggestionChips>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

/** With the viewer's location, "What's closest to me?" comes first. */
export const Located: Story = { args: { located: true } }
