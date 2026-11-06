import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const meta = { title: "UI/Select", component: Select } satisfies Meta<typeof Select>
export default meta
export const Repeats: StoryObj<typeof meta> = {
  render: () => (
    <Select defaultValue="none">
      <SelectTrigger className="w-56" aria-label="Repeats"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Doesn&apos;t repeat</SelectItem>
        <SelectItem value="weekly">Every week</SelectItem>
        <SelectItem value="monthly">Every month</SelectItem>
      </SelectContent>
    </Select>
  ),
}
