import type { NextConfig } from "next"
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD } from "next/constants"
import createNextIntlPlugin from "next-intl/plugin"
import { withBotId } from "botid/next/config"
import { buildMessages, watchMessages } from "./scripts/i18n/build.mjs"

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts")

const nextConfig: NextConfig = {
  // next lint's default folders, plus Storybook's config.
  eslint: { dirs: ["src", "app", "pages", "components", "lib", ".storybook"] },
  // The blog posts' hero images (public/blog/*/metadata.json), resized by next/image (#298).
  // A new post with a hero from another host adds it here.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "rarecandy.com", pathname: "/_next/image" },
      { protocol: "https", hostname: "tse1.mm.bing.net", pathname: "/th" },
    ],
  },
}

export default function config(phase: string) {
  // messages/*.yml → src/i18n/generated (docs/i18n.md); next dev also rebuilds on
  // every change. `next start` serves what the build made, so it builds nothing.
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_BUILD) buildMessages()
  if (phase === PHASE_DEVELOPMENT_SERVER) watchMessages()
  // BotID's script and challenge are proxied through our domain (#198).
  return withBotId(withNextIntl(nextConfig))
}
