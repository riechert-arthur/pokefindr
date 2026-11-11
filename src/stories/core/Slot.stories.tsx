import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Slot, SlotModules } from "@/core/shell/Slot"
import { defineModule, type ModuleManifest } from "@/core/shell/module"
import { TEST_MODULE, throwing } from "@/core/shell/test-modules"

const card = (text: string) => async () => ({
  default: function Card() {
    return <div className="rounded-md border border-border bg-card p-3 text-body">{text}</div>
  },
})

const several = defineModule({
  id: "several",
  name: "Several",
  contributes: {
    "dashboard.tile": [
      { id: "second", order: 2, load: card("Second (order 2)") },
      { id: "first", order: 1, load: card("First (order 1)") },
    ],
  },
})
const broken = defineModule({ id: "broken", name: "Broken", contributes: { "dashboard.tile": [{ id: "boom", load: throwing }, { id: "fine", order: 1, load: card("Still here: the broken one rendered nothing") }] } })

/** `<Slot>` (#324): what modules contribute to a place in a core screen. */
const meta = {
  title: "Core/Slot",
  component: Slot,
  args: { name: "dashboard.tile", props: {} },
  render: (args, { parameters }) => (
    <SlotModules modules={parameters.modules as ModuleManifest[]}>
      <div className="grid w-80 gap-2">
        <Slot {...args} />
      </div>
    </SlotModules>
  ),
} satisfies Meta<typeof Slot>
export default meta
type Story = StoryObj<typeof meta>

/** No module contributes: the slot renders nothing. */
export const Empty: Story = { parameters: { modules: [] } }
export const OneContribution: Story = { parameters: { modules: [TEST_MODULE] } }
/** Rendered by `order`, then registry order. */
export const Several: Story = { parameters: { modules: [several] } }
/** One contribution throws; the rest of the slot (and page) keeps working. */
export const OneThrowing: Story = { parameters: { modules: [broken] } }
