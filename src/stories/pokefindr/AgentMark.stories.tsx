import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import type { LucideIcon } from "lucide-react"
import { AgentMark } from "@/components/brand/AgentMark"
import { AGENT_GLYPHS } from "@/components/brand/agent-glyphs"
import { Logo } from "@/components/brand/Logo"

const meta = { title: "PokeFindr/AgentMark", component: AgentMark, args: { size: "md" } } satisfies Meta<typeof AgentMark>
export default meta
type Story = StoryObj<typeof meta>

const SIZES = ["sm", "md", "lg"] as const

/** One glyph at 26, 34 and 44 px, next to the logo at the same heights. */
function Row({ glyph }: { glyph?: LucideIcon }) {
  return (
    <div className="flex items-end gap-3">
      {SIZES.map((s) => <AgentMark key={s} size={s} glyph={glyph} />)}
      <span className="w-3" />
      {[26, 34, 44].map((px) => <Logo key={px} size={px} title="" />)}
    </div>
  )
}

/** The one in use, as in the conversation (sm) and on the home greeting (lg). */
export const Default: Story = {}
export const Sizes: Story = { render: () => <Row /> }

/** Every candidate, at every size, for picking the direction (#303). */
function Panel({ title, dark }: { title: string; dark?: boolean }) {
  return (
    <div className={`${dark ? "dark " : ""}grid gap-4 rounded-xl border border-border bg-background p-4 text-foreground`}>
      <p className="text-subheading">{title}</p>
      {AGENT_GLYPHS.map((g) => (
        <div key={g.name} className="grid gap-1.5">
          <p className="text-body font-medium">{g.name}</p>
          <p className="text-caption text-muted-foreground">{g.description}</p>
          <Row glyph={g.icon} />
        </div>
      ))}
    </div>
  )
}

/**
 * The toolbar's theme on the left and, when that's light, dark beside it.
 * A is the one AgentMark uses until the owner picks.
 */
export const Options: Story = {
  parameters: { layout: "padded" },
  render: (_args, { globals }) =>
    globals.theme === "dark" ? (
      <Panel title="Dark" />
    ) : (
      <div className="flex flex-wrap gap-4">
        <Panel title="Light" />
        <Panel title="Dark" dark />
      </div>
    ),
}
