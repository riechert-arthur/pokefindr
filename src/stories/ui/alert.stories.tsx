import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { MailIcon, TriangleAlertIcon } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

const meta = { title: "UI/Alert", component: Alert } satisfies Meta<typeof Alert>
export default meta
type Story = StoryObj<typeof meta>
/** A note that stays on the page, like the email-change note in settings. */
export const Default: Story = {
  render: () => (
    <Alert role="status" className="w-96">
      <MailIcon aria-hidden className="size-4" />
      <AlertDescription>We&apos;ve emailed misty@example.com a link to approve the change to misty@pokefindr.com. Then confirm it from that inbox.</AlertDescription>
    </Alert>
  ),
}
export const WithTitle: Story = {
  render: () => (
    <Alert className="w-96">
      <AlertTitle>Check your inbox</AlertTitle>
      <AlertDescription>The link expires in an hour.</AlertDescription>
    </Alert>
  ),
}
export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-96">
      <TriangleAlertIcon aria-hidden className="size-4" />
      <AlertTitle>That link has expired</AlertTitle>
      <AlertDescription>Start the change again below.</AlertDescription>
    </Alert>
  ),
}
