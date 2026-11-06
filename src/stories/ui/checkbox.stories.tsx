import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

const meta = { title: "UI/Checkbox", component: Checkbox } satisfies Meta<typeof Checkbox>
export default meta
const RETAILERS = [
  { id: "safeway", name: "Safeway", count: 417, checked: true },
  { id: "kroger", name: "Kroger", count: 259, checked: false },
  { id: "fredmeyer", name: "Fred Meyer", count: 113, checked: false },
]

export const Retailers: StoryObj<typeof meta> = {
  render: () => (
    <div className="grid gap-2">
      {RETAILERS.map(({ id, name, count, checked }) => (
        <div key={id} className="flex items-center gap-2 text-body">
          <Checkbox id={id} defaultChecked={checked} />
          <Label htmlFor={id}>{name}</Label>
          <span className="ml-auto pl-6 text-caption tabular-nums text-muted-foreground">{count}</span>
        </div>
      ))}
    </div>
  ),
}
