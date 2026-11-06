import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

const meta = { title: "UI/Dialog", component: Dialog } satisfies Meta<typeof Dialog>
export default meta

export const Default: StoryObj<typeof meta> = {
  render: () => (
    <Dialog>
      <DialogTrigger asChild><Button variant="outline">Delete review</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this review?</DialogTitle>
          <DialogDescription>Your rating for QFC will be removed. This can&apos;t be undone.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button variant="destructive">Delete</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
}
