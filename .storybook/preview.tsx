import type { Preview } from "@storybook/nextjs-vite"
import { withThemeByClassName } from "@storybook/addon-themes"
import "../src/app/globals.css"
import { TooltipProvider } from "../src/components/ui/tooltip"

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  decorators: [
    // The app mounts one TooltipProvider in ContextProviders; do the same here.
    (Story) => (
      <TooltipProvider>
        <Story />
      </TooltipProvider>
    ),
    // Same mechanism as the app: a light/dark class on <html> switches every token.
    withThemeByClassName({ themes: { light: "light", dark: "dark" }, defaultTheme: "light", parentSelector: "html" }),
  ],
}

export default preview
