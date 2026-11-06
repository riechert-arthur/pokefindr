import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import { useState } from "react"
import { TypeChip } from "@/components/pokefindr/TypeChip"
import { KIND_ORDER, type LocationKind } from "@/components/pokefindr/kinds"

const COUNTS: Record<LocationKind, number> = { vending: 1457, shop: 30, event: 5 }

function ChipRow({ short }: { short?: boolean }) {
  const [on, setOn] = useState<Set<LocationKind>>(new Set(KIND_ORDER))
  return (
    <div className="flex flex-wrap gap-1.5">
      {KIND_ORDER.map((k) => (
        <TypeChip key={k} kind={k} short={short} count={COUNTS[k]} pressed={on.has(k)} onPressedChange={(p) => setOn((s) => { const n = new Set(s); if (p) n.add(k); else n.delete(k); return n })} />
      ))}
    </div>
  )
}

const meta = {
  title: "PokeFindr/TypeChip",
  component: TypeChip,
  args: { kind: "vending", count: 1457, pressed: true, short: true, onPressedChange: fn() },
} satisfies Meta<typeof TypeChip>
export default meta
type Story = StoryObj<typeof meta>
/** One chip; its props are in Controls. */
export const Single: Story = {}
export const Row: Story = { render: () => <ChipRow short /> }
export const LongLabels: Story = { render: () => <ChipRow /> }
