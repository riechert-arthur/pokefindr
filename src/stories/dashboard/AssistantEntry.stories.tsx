import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { AssistantEntry } from "@/components/assistant/AssistantEntry"
import { clearChat, saveChat } from "@/lib/assistant/saved-chat"

/** /home's way into the assistant (#391): the composer and suggestions; asking opens /chat. */
const meta = {
  title: "Dashboard/AssistantEntry",
  component: AssistantEntry,
  args: { viewer: null, userId: "story-user", hasSavedChat: false },
  decorators: [(Story) => <div className="mx-auto grid max-w-[780px] gap-[18px] p-4"><Story /></div>],
} satisfies Meta<typeof AssistantEntry>
export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: (args) => {
    clearChat("story-user")
    return <AssistantEntry {...args} />
  },
}

/** With the location shared, "What's closest to me?" comes first. */
export const Located: Story = {
  args: { viewer: { lng: -122.34, lat: 47.61 } },
  render: Default.render,
}

/** A conversation saved in this browser: a link back to it on /chat. */
export const ContinueYourChat: Story = {
  args: { hasSavedChat: true },
  render: (args) => {
    saveChat("story-user", [{ id: 1, role: "user", text: "machines in Seattle?" }])
    return <AssistantEntry {...args} />
  },
}
