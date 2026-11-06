import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  // next lint's default folders, plus Storybook's config.
  eslint: { dirs: ["src", "app", "pages", "components", "lib", ".storybook"] },
}

export default nextConfig
