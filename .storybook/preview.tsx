import { useEffect } from "react"
import type { Preview } from "@storybook/nextjs-vite"
import { useGlobals } from "storybook/preview-api"
import { useTheme } from "next-themes"
import { NextIntlClientProvider } from "next-intl"
import "../src/app/globals.css"
import { ThemeProvider } from "../src/components/providers/ThemeProvider"
import { TooltipProvider } from "../src/components/ui/tooltip"
import { MESSAGES } from "../src/i18n/all-messages"
import { DEFAULT_LOCALE, LOCALES, type Locale } from "../src/i18n/routing"

/**
 * In stories where the component under test changes the theme (ThemeToggle),
 * keep the toolbar and next-themes in step both ways.
 */
function SyncThemeWithToolbar({ toolbar, setToolbar }: { toolbar?: string; setToolbar: (theme: string) => void }) {
  const { resolvedTheme, setTheme } = useTheme()
  useEffect(() => {
    if (resolvedTheme && resolvedTheme !== toolbar) setToolbar(resolvedTheme)
    // Only when the component changes the theme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolvedTheme])
  useEffect(() => {
    if (toolbar && toolbar !== resolvedTheme) setTheme(toolbar)
    // Only when the toolbar changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toolbar])
  return null
}

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
    // Components use next/navigation (App Router).
    nextjs: { appDirectory: true },
    // The panel shows every issue; CI gating (serious/critical only) lives in .storybook/test-runner.ts.
    a11y: { test: "todo" },
  },
  // Light/dark from the toolbar.
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true },
    },
    // The language, like the app's /es prefix (docs/i18n.md).
    locale: {
      description: "Language",
      toolbar: { title: "Language", icon: "globe", items: [...LOCALES], dynamicTitle: true },
    },
  },
  initialGlobals: {
    theme: "light",
    locale: DEFAULT_LOCALE,
    // Under the a11y test runner (it sets this flag before the page loads), the
    // addon doesn't run axe itself: .storybook/test-runner.ts does, in light and
    // dark, and two runs would share one axe instance.
    ...(typeof window !== "undefined" && (window as unknown as { __A11Y_TEST_RUNNER__?: boolean }).__A11Y_TEST_RUNNER__
      ? { a11y: { manual: true } }
      : {}),
  },
  decorators: [
    // The same providers as the app: next-intl with the toolbar's language,
    // next-themes setting the light/dark class on <html> (so tokens and
    // theme-aware components like the Toaster agree), and one TooltipProvider,
    // as in ContextProviders. The toolbar forces the theme,
    // except in stories with `parameters.themeToggle`, where the component under
    // test changes it and the toolbar follows.
    (Story, { parameters }) => {
      const [globals, updateGlobals] = useGlobals()
      const toggle = Boolean(parameters.themeToggle)
      const locale: Locale = LOCALES.includes(globals.locale) ? globals.locale : DEFAULT_LOCALE
      return (
        <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
          <ThemeProvider storageKey="storybook-theme" forcedTheme={toggle ? undefined : globals.theme}>
            {toggle && <SyncThemeWithToolbar toolbar={globals.theme} setToolbar={(theme) => updateGlobals({ theme })} />}
            <TooltipProvider>
              <Story />
            </TooltipProvider>
          </ThemeProvider>
        </NextIntlClientProvider>
      )
    },
  ],
}

export default preview
