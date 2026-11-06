import type { Preview } from "@storybook/nextjs-vite"
import { withThemeByClassName } from "@storybook/addon-themes"
import "../src/app/globals.css"

const preview: Preview = {
  parameters: {
    layout: "centered",
    controls: { expanded: true },
  },
  decorators: [
    // Same mechanism as the app: a light/dark class on <html> switches every token.
    withThemeByClassName({ themes: { light: "light", dark: "dark" }, defaultTheme: "light", parentSelector: "html" }),
  ],
}

export default preview
