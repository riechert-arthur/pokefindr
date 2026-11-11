import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { GlobeIcon } from "lucide-react"
import { COMPACT_TRIGGER, CompactLabel } from "@/components/pokefindr/CompactSelect"
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select"
import { cn } from "@/lib/utils"

/** The compact pickers' trigger (the app rail's language and theme badges), with a label that truncates inside it. */
function CompactTrigger({ label, width }: { label: string; width: number }) {
  return (
    <div style={{ width }}>
      <Select value="a">
        <SelectTrigger aria-label={`Example: ${label}`} className={cn(COMPACT_TRIGGER, "w-full [&>span]:mr-auto")}>
          <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <CompactLabel>{label}</CompactLabel>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="a">{label}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  )
}

const meta = {
  title: "PokeFindr/CompactSelect",
  component: CompactTrigger,
  parameters: { layout: "padded" },
} satisfies Meta<typeof CompactTrigger>
export default meta
type Story = StoryObj<typeof meta>

/** As in the expanded app rail. */
export const Short: Story = { args: { label: "English", width: 188 } }
/** A label longer than the badge ends in an ellipsis, and the arrow stays in view. */
export const LongLabel: Story = { args: { label: "Português (Brasil) — a long language name", width: 188 } }
