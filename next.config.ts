import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER } from "next/constants"
import createNextIntlPlugin from "next-intl/plugin"
import { buildMessages, watchMessages } from "./scripts/i18n/build.mjs"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const nextConfig: NextConfig = {
  // next lint's default folders, plus Storybook's config.
  eslint: { dirs: ["src", "app", "pages", "components", "lib", ".storybook"] },
}

export default function config(phase: string) {
  // messages/*.yml → src/i18n/generated (docs/i18n.md); next dev also rebuilds on every change.
  buildMessages()
  if (phase === PHASE_DEVELOPMENT_SERVER) watchMessages()
  return withNextIntl(nextConfig)
}
