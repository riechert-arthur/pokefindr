import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { NextIntlClientProvider } from "next-intl"
import { AppRail } from "@/components/pokefindr/AppRail"
import { MESSAGES } from "@/i18n/all-messages"

const meta = {
  title: "PokeFindr/AppRail",
  component: AppRail,
  parameters: { layout: "fullscreen", nextjs: { navigation: { pathname: "/map" } } },
  // The page beside the rail, so the expanded panel shows over it.
  decorators: [(Story) => <div className="flex h-[480px] w-[360px]"><Story /><div className="flex-1 bg-muted/50 p-4 text-body text-foreground">Page</div></div>],
} satisfies Meta<typeof AppRail>
export default meta
type Story = StoryObj<typeof meta>

/** On the map, signed out. */
export const OnMap: Story = {}

/** A moderator on /moderate: Moderate, but no Admin. */
export const Moderator: Story = {
  args: { signedIn: true, canModerate: true },
  parameters: { nextjs: { navigation: { pathname: "/moderate" } } },
}

/** On the dashboard, signed in: Settings appears at the bottom. */
export const SignedIn: Story = {
  args: { signedIn: true },
  parameters: { nextjs: { navigation: { pathname: "/home" } } },
}

/** Hovered or tabbed into: 208px wide over the page, with a label beside each icon (#291). */
export const Expanded: Story = { args: { expanded: true } }

/** Expanded for a signed-in admin: Admin and Settings too. */
export const ExpandedSignedInAdmin: Story = {
  args: { expanded: true, signedIn: true, isAdmin: true },
  parameters: { nextjs: { navigation: { pathname: "/admin" } } },
}

/**
 * The longer Spanish labels stay on one line. In Spanish whatever the toolbar
 * says, so it shows next to the English stories (the a11y run also checks
 * every story in Spanish).
 */
export const ExpandedSpanish: Story = {
  args: { expanded: true, signedIn: true, isAdmin: true },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="es" messages={MESSAGES.es} timeZone="UTC">
        <div lang="es" className="contents">
          <Story />
        </div>
      </NextIntlClientProvider>
    ),
  ],
}
