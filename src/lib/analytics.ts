import { track as vercelTrack } from "@vercel/analytics"
import { publicConfig, type AnalyticsProvider } from "@/config.public"

/**
 * Product analytics (#53): one `track` for the whole app, sent to whichever
 * provider is configured (NEXT_PUBLIC_ANALYTICS_PROVIDER), or nowhere.
 * Events carry no personal data: no ids, emails, coordinates or typed text.
 */

/** A property value every provider accepts. */
export type EventProps = Record<string, string | number | boolean | null>

declare global {
  interface Window {
    plausible?: ((event: string, options?: { props?: EventProps }) => void) & { q?: unknown[] }
    umami?: { track: (event: string, data?: EventProps) => void }
  }
}

/** Sends `event` to `provider`. Never throws: analytics mustn't break the page. */
export function sendEvent(provider: AnalyticsProvider, event: string, props?: EventProps): void {
  if (typeof window === "undefined") return
  try {
    switch (provider) {
      case "vercel":
        vercelTrack(event, props)
        return
      case "plausible":
        // The script defines window.plausible; queue calls made before it loads, as Plausible documents.
        window.plausible ??= Object.assign((...args: unknown[]) => void (window.plausible!.q ??= []).push(args), {})
        window.plausible(event, props ? { props } : undefined)
        return
      case "umami":
        window.umami?.track(event, props)
        return
      case "none":
        return
    }
  } catch (err) {
    console.warn("[analytics] couldn't send", event, err)
  }
}

/** Records a product event with the configured provider. */
export const track = (event: string, props?: EventProps) => sendEvent(publicConfig.analytics.provider, event, props)
