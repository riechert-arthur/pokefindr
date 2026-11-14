import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { expect, userEvent, within } from "storybook/test"
import { OpenNavButton } from "@/components/pokefindr/OpenNavButton"
import { SidebarProvider } from "@/components/providers/SidebarContextProvider"

// Phones only (it's hidden from `sm` up), so the story starts on a phone.
const meta = {
  title: "PokeFindr/OpenNavButton",
  component: OpenNavButton,
  globals: { viewport: { value: "mobile1", isRotated: false } },
  decorators: [(Story) => <SidebarProvider><Story /></SidebarProvider>],
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
