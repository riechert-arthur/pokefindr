import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { KindDot } from "@/components/pokefindr/KindDot"
import { ResponsivePanel } from "@/components/pokefindr/ResponsivePanel"
import { StarRating } from "@/components/pokefindr/StarRating"

function Example() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>View details</Button>
      <ResponsivePanel open={open} onOpenChange={setOpen} title="QFC" description="1401 Broadway, Seattle, WA">
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

const meta = { title: "PokeFindr/ResponsivePanel", component: Example } satisfies Meta<typeof Example>
export default meta
export const Default: StoryObj<typeof meta> = {}
