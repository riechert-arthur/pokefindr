import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Toaster } from "@/components/ui/sonner"

const meta = { title: "UI/Sonner (toast)", component: Toaster } satisfies Meta<typeof Toaster>
export default meta
export const Default: StoryObj<typeof meta> = {
  render: () => (
    <>
      <Toaster />
      <Button variant="outline" onClick={() => toast("Link copied", { description: "pokefindr.com/map?location=296a6fa2" })}>Copy link</Button>
    </>
  ),
}
