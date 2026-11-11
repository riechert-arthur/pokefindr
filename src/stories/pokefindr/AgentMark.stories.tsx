import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { AgentMark } from "@/components/brand/AgentMark"
import { Logo } from "@/components/brand/Logo"

const meta = { title: "PokeFindr/AgentMark", component: AgentMark, args: { size: "md" } } satisfies Meta<typeof AgentMark>
export default meta
type Story = StoryObj<typeof meta>

/** The mark at its default size, 34 px, at rest. */
export const Default: Story = {}

/** While the assistant is working: the sweeps turn (not with reduced motion). */
export const Thinking: Story = { args: { thinking: true } }

/** At 26, 34 and 44 px (the conversation, the default, the home greeting), at rest and thinking, next to the logo at the same heights. */
export const Sizes: Story = {
  render: () => (
    <div className="grid gap-4">
      {[false, true].map((thinking) => (
        <div key={String(thinking)} className="flex items-end gap-3">
          {(["sm", "md", "lg"] as const).map((s) => <AgentMark key={s} size={s} thinking={thinking} />)}
          <span className="w-3" />
          {[26, 34, 44].map((px) => <Logo key={px} size={px} title="" />)}
        </div>
      ))}
    </div>
  ),
}
