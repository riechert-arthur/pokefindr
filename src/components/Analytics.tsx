"use client"

import Script from "next/script"
import { Analytics as VercelAnalytics } from "@vercel/analytics/next"
import { publicConfig } from "@/config.public"
import { flushUmami } from "@/lib/analytics"

/**
 * The configured analytics provider's page-view tracker (#53): Vercel,
 * Plausible, Umami, or nothing (the default, so local dev and CI send
 * nothing). Product events go through `track` in src/lib/analytics.ts.
 */
export function Analytics({ config = publicConfig.analytics }: { config?: typeof publicConfig.analytics }) {
  switch (config.provider) {
    case "vercel":
      return <VercelAnalytics />
    case "plausible":
      if (!config.site) return null
      return <Script defer data-domain={config.site} src={config.scriptUrl || "https://plausible.io/js/script.js"} strategy="afterInteractive" />
    case "umami":
      if (!config.site) return null
      return <Script defer data-website-id={config.site} src={config.scriptUrl || "https://cloud.umami.is/script.js"} strategy="afterInteractive" onReady={flushUmami} />
    default:
      return null
  }
}
