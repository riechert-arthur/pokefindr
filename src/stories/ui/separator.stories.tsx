import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Separator } from "@/components/ui/separator"

const meta = { title: "UI/Separator", component: Separator } satisfies Meta<typeof Separator>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <div className="w-72 text-body">
      <p>Retailer · QFC</p>
      <Separator className="my-2" />
      <p>Machine ID · Q00245</p>
    </div>
  ),
}
