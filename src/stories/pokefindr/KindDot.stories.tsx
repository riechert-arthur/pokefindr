import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { KindDot, KindIcon } from "@/components/pokefindr/KindDot"
import { KIND_ORDER, KINDS } from "@/components/pokefindr/kinds"

const meta = { title: "PokeFindr/KindDot", component: KindDot, args: { kind: "vending" } } satisfies Meta<typeof KindDot>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const AllKinds: Story = {
  render: () => (
    <div className="grid gap-3">
      {KIND_ORDER.map((k) => (
        <div key={k} className="flex items-center gap-3 text-body">
          <KindDot kind={k} size="sm" /> <KindDot kind={k} /> <KindDot kind={k} size="lg" /> <KindIcon kind={k} /> {KINDS[k].label}
        </div>
      ))}
    </div>
  ),
}
