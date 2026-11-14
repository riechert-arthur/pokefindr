import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { APP_NAV_ID } from "@/components/pokefindr/AppRail"
import { OpenNavButton } from "@/components/pokefindr/OpenNavButton"
import { SidebarProvider } from "@/components/providers/SidebarContextProvider"

const meta = {
  title: "PokeFindr/OpenNavButton",
  component: OpenNavButton,
  // It's hidden from `sm` up, as on phones only; shown at every width here, since
  // the test runner's page is desktop-sized.
  args: { className: "sm:inline-flex" },
  decorators: [
    (Story) => (
      <SidebarProvider>
        <Story />
        {/* What the button opens: the app rail, which isn't in this story. */}
        <div id={APP_NAV_ID} hidden />
      </SidebarProvider>
    ),
  ],
} satisfies Meta<typeof OpenNavButton>
export default meta
type Story = StoryObj<typeof meta>

/** Pressing it opens the navigation, which aria-expanded reports. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "Open navigation" })
    await expect(button).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(button)
    await expect(button).toHaveAttribute("aria-expanded", "true")
  },
}
