import { useEffect } from "react"
import type { Preview } from "@storybook/nextjs-vite"
import { useGlobals } from "storybook/preview-api"
import { useTheme } from "next-themes"
import "../src/app/globals.css"
import { ThemeProvider } from "../src/components/providers/ThemeProvider"
import { TooltipProvider } from "../src/components/ui/tooltip"

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
  },
  initialGlobals: {
    theme: "light",
    // When Playwright drives the page (the a11y test runner), the addon doesn't
    // run axe itself: .storybook/test-runner.ts does, in light and dark, and two
    // runs would share one axe instance.
    ...(typeof navigator !== "undefined" && navigator.webdriver ? { a11y: { manual: true } } : {}),
  },
  decorators: [
    // The same providers as the app: next-themes sets the light/dark class on
    // <html> (so tokens and theme-aware components like the Toaster agree), and
    // one TooltipProvider, as in ContextProviders. The toolbar forces the theme,
    // except in stories with `parameters.themeToggle`, where the component under
    // test changes it and the toolbar follows.
    (Story, { parameters }) => {
      const [globals, updateGlobals] = useGlobals()
      const toggle = Boolean(parameters.themeToggle)
      return (
        <ThemeProvider storageKey="storybook-theme" forcedTheme={toggle ? undefined : globals.theme}>
          {toggle && <SyncThemeWithToolbar toolbar={globals.theme} setToolbar={(theme) => updateGlobals({ theme })} />}
          <TooltipProvider>
            <Story />
          </TooltipProvider>
        </ThemeProvider>
      )
    },
  ],
}

export default preview
