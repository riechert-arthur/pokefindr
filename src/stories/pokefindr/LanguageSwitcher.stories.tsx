import type { Meta, StoryObj } from "@storybook/nextjs-vite"
import { LanguageSwitcher } from "@/components/pokefindr/LanguageSwitcher"
import { LOCALES } from "@/i18n/routing"

/**
 * Picks the page's language (#182), each language in its own name. Shown only
 * when more than one language is public; these stories list every language.
 * Use the toolbar's Language to see it from a Spanish page.
 */
const meta = {
  title: "PokeFindr/LanguageSwitcher",
  component: LanguageSwitcher,
  args: { locales: LOCALES },
} satisfies Meta<typeof LanguageSwitcher>

export default meta
type Story = StoryObj<typeof meta>

/** Settings: the language's name. */
export const Full: Story = { args: { variant: "full" } }

/** The footer and the app rail: a globe and the code. */
export const Compact: Story = { args: { variant: "compact" } }
