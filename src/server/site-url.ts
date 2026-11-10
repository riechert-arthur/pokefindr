import { log } from "@/server/log"

/**
 * The site's absolute URL, for metadata such as og:image. Server-only: it
 * reads VERCEL_ENV, which Vercel always sets on the server.
 *
 * - SITE_URL (or NEXT_PUBLIC_SITE_URL) wins when it's a valid absolute URL.
 * - `next dev` and Vercel preview/development deployments get undefined, so
 *   Next uses localhost or the deployment's own URL.
 * - Everything else (Vercel production, self-hosted) gets the production URL.
 */
export const PRODUCTION_URL = "https://pokefindr.app"

export function getSiteUrl(env: Record<string, string | undefined> = process.env): URL | undefined {
  const configured = env.SITE_URL || env.NEXT_PUBLIC_SITE_URL
  if (configured) {
    try {
      return new URL(configured)
    } catch {
      log.warn("config.invalid_site_url", { msg: "ignoring SITE_URL: it needs a scheme, like https://" })
    }
  }
  if (env.NODE_ENV === "development") return undefined
  if (env.VERCEL_ENV && env.VERCEL_ENV !== "production") return undefined
  return new URL(PRODUCTION_URL)
}
