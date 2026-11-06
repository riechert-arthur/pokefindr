import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"

const meta = { title: "UI/Checkbox", component: Checkbox } satisfies Meta<typeof Checkbox>
export default meta
export const Retailers: StoryObj<typeof meta> = {
  render: () => (
    <div className="grid gap-2">
      {[["safeway", "Safeway", 417, true], ["kroger", "Kroger", 259, false], ["fredmeyer", "Fred Meyer", 113, false]].map(([id, name, n, checked]) => (
        <div key={String(id)} className="flex items-center gap-2 text-body">
          <Checkbox id={String(id)} defaultChecked={Boolean(checked)} />
          <Label htmlFor={String(id)}>{name}</Label>
          <span className="ml-auto pl-6 text-caption tabular-nums text-muted-foreground">{n}</span>
        </div>
      ))}
    </div>
  ),
}
