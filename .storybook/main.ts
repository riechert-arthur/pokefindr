import type { StorybookConfig } from "@storybook/nextjs-vite"

/** Component workshop for src/components/ui and src/components/pokefindr (docs/design-system.md). */
const config: StorybookConfig = {
  framework: "@storybook/nextjs-vite",
  stories: ["../src/stories/**/*.stories.@(ts|tsx)"],
  addons: [],
  staticDirs: ["../public"],
}

export default config
