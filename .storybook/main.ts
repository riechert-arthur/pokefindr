import type { StorybookConfig } from "@storybook/nextjs-vite"
import { buildMessages } from "../scripts/i18n/build.mjs"

// Stories read the same catalogs as the app (docs/i18n.md).
buildMessages()

/** Component workshop for src/components/ui and src/components/pokefindr (docs/design-system.md). */
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/stories/**/*.stories.@(ts|tsx)"],
  addons: ["@storybook/addon-a11y"],
  staticDirs: ["../public"],
}

export default config
