import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { fn } from "storybook/test"
import type { ComponentProps } from "react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { KindDot } from "@/components/pokefindr/KindDot"
import { ResponsivePanel } from "@/components/pokefindr/ResponsivePanel"
import { StarRating } from "@/components/pokefindr/StarRating"

/** Opens the panel from a button; the other props come from Controls. */
function Example(args: ComponentProps<typeof ResponsivePanel>) {
  const [open, setOpen] = useState(false)
  const onOpenChange = (next: boolean) => {
    args.onOpenChange(next) // logged in Actions
    setOpen(next)
  }
  return (
    <>
      <Button onClick={() => onOpenChange(true)}>View details</Button>
      <ResponsivePanel {...args} open={open} onOpenChange={onOpenChange}>
        <div className="flex items-center gap-2 text-body">
          <KindDot kind="vending" /> Vending machine · Q00245
        </div>
        <div className="mt-3 flex items-center gap-2 text-body text-muted-foreground">
          <StarRating rating={4} starSize={16} /> 4.0 · 1 review
        </div>
      </ResponsivePanel>
    </>
  )
}

const meta = {
  title: "PokeFindr/ResponsivePanel",
  component: ResponsivePanel,
  args: { title: "QFC", description: "1401 Broadway, Seattle, WA", side: "left", modal: false, open: false, onOpenChange: fn(), children: null },
  // The example owns open state and content, so those aren't controls.
  argTypes: {
    open: { table: { disable: true } },
    children: { table: { disable: true } },
  },
  render: (args) => <Example {...args} />,
} satisfies Meta<typeof ResponsivePanel>
export default meta
export const Default: StoryObj<typeof meta> = {}
