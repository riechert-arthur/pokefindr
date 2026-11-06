import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const meta = { title: "UI/Label", component: Label } satisfies Meta<typeof Label>
export default meta
export const WithInput: StoryObj<typeof meta> = {
  render: () => (
    <div className="grid w-80 gap-1.5">
      <Label htmlFor="website">Website</Label>
      <Input id="website" placeholder="https://" />
    </div>
  ),
}
