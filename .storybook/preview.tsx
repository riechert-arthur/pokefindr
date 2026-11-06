import type { Preview } from "@storybook/nextjs-vite"
import "../src/app/globals.css"
import { ThemeProvider } from "../src/components/providers/ThemeProvider"
import { TooltipProvider } from "../src/components/ui/tooltip"

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  // Light/dark from the toolbar.
  globalTypes: {
    theme: {
      description: "Theme",
      toolbar: { title: "Theme", icon: "mirror", items: ["light", "dark"], dynamicTitle: true },
    },
  },
  initialGlobals: { theme: "light" },
  decorators: [
    // The same providers as the app: next-themes sets the light/dark class on
    // <html> (so tokens and theme-aware components like the Toaster agree), and
    // one TooltipProvider, as in ContextProviders. The toolbar forces the theme,
    // except in stories with `parameters.themeToggle`, where the component
    // under test changes it.
    (Story, { globals, parameters }) => (
      <ThemeProvider storageKey="storybook-theme" forcedTheme={parameters.themeToggle ? undefined : globals.theme}>
        <TooltipProvider>
          <Story />
        </TooltipProvider>
      </ThemeProvider>
    ),
  ],
}

export default preview
