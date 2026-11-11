import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { ChatDashboard } from "@/components/assistant/ChatDashboard"
import { SessionContextProvider } from "@/components/providers/SessionProvider"
import { SidebarProvider } from "@/components/providers/SidebarContextProvider"
import { clearChat, saveChat } from "@/lib/assistant/saved-chat"
import type { ChatMessage } from "@/lib/types/assistant"

const answer = (id: number, text: string): ChatMessage => ({ id, role: "assistant", text, cards: [], status: null, note: null, memory: null, turnId: null, done: true })
const CONVERSATION: ChatMessage[] = [
  { id: 1, role: "user", text: "Which retailers have the most machines in Washington?" },
  answer(2, "**Safeway** has the most, then **Fred Meyer** and **QFC**."),
  { id: 3, role: "user", text: "Plan a route through 4 machines near Seattle" },
  answer(4, "Here's a route through four Safeway machines, about 12 miles in all."),
]

/** /chat (#391): the assistant's own page, in the dashboard's frame (header, glow). */
const meta = {
  title: "Dashboard/ChatDashboard",
  component: ChatDashboard,
  args: { userId: "story-user", hasSavedChat: false },
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/chat" } } },
  decorators: [
    (Story) => (
      <SessionContextProvider>
        <SidebarProvider>
          <div className="h-[640px]">
            <Story />
          </div>
        </SidebarProvider>
      </SessionContextProvider>
    ),
  ],
} satisfies Meta<typeof ChatDashboard>
export default meta
type Story = StoryObj<typeof meta>

/** No conversation yet: a greeting, the composer and the suggestions. */
export const Empty: Story = {
  render: (args) => {
    clearChat("story-user")
    return <ChatDashboard {...args} />
  },
}

/** A conversation saved in this browser (#346): it opens on it, centered, scrolling at the window's edge. */
export const Saved: Story = {
  args: { hasSavedChat: true },
  render: (args) => {
    saveChat("story-user", CONVERSATION)
    return <ChatDashboard {...args} />
  },
}
