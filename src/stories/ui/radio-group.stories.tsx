import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const meta = { title: "UI/Radio group", component: RadioGroup } satisfies Meta<typeof RadioGroup>
export default meta
export const ReportReason: StoryObj<typeof meta> = {
  render: () => (
    <RadioGroup defaultValue="gone" aria-label="What's wrong?">
      {[["gone", "It's gone or was removed"], ["pin", "Wrong address or pin"], ["empty", "Empty for a long time"]].map(([v, l]) => (
        <div key={v} className="flex items-center gap-2 text-body">
          <RadioGroupItem value={v} id={v} />
          <Label htmlFor={v}>{l}</Label>
        </div>
      ))}
    </RadioGroup>
  ),
}
