import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { AdminSidebar } from "@/components/admin/AdminSidebar"
import type { AdminGroup } from "@/lib/admin/sections"

/** The prototype's full sidebar, so the story shows every group even before each section ships. */
const GROUPS: AdminGroup[] = [
  {
    id: "moderation",
    label: "Moderation",
    sections: [
      { id: "queue", label: "Review queue", sub: "", entitlement: "moderation.view" },
      { id: "reports", label: "Reports", sub: "", entitlement: "moderation.view" },
    ],
  },
  {
    id: "locations",
    label: "Locations",
    sections: [
      { id: "coverage", label: "Coverage", sub: "", entitlement: "admin.coverage" },
      { id: "add-vending", label: "Add vending machine", sub: "", entitlement: "admin.vending" },
    ],
  },
  {
    id: "system",
    label: "System",
    sections: [
      { id: "jobs", label: "Jobs", sub: "", entitlement: "admin.jobs" },
      { id: "ads", label: "Ads", sub: "", entitlement: "admin.ads" },
    ],
  },
]

const meta = {
  title: "Admin/AdminSidebar",
  component: AdminSidebar,
  parameters: { layout: "fullscreen" },
  decorators: [(Story) => <div className="flex h-[640px] bg-background"><Story /></div>],
  args: {
    groups: GROUPS,
    current: "reports",
    counts: { queue: { count: 3, hot: true }, reports: { count: 3, hot: false } },
    onSelect: fn(),
    user: { username: "misty", role: "admin" },
  },
} satisfies Meta<typeof AdminSidebar>
export default meta
type Story = StoryObj<typeof meta>

/** A queue item waiting over 24 h turns its count red. Light and dark: the toolbar's theme (the a11y run checks both). */
export const Default: Story = {}

/** Below 768px: a scrolling strip, groups don't fold. */
export const Phone: Story = { globals: { viewport: { value: "mobile1", isRotated: false } } }
