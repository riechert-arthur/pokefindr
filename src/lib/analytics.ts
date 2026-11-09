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

/**
 * The product events (#137) and their properties. Kinds and where something
 * happened only: no ids, coordinates or typed text.
 */
export interface ProductEvents {
  /** A search result picked: an area's kind ("city", "state", ...) or "location"; on the landing page or the map. */
  search: { result: string; from: "landing" | "map" }
  /** Leaving the landing page for the map. */
  open_map_from_landing: { via: "search" | "quick_pick" | "my_location" | "button" }
  /** A kind chip, the retailer filter or the radius. `value` is what's now on: kinds or retailers joined by commas ("all" when none filtered), or the miles. */
  filter_change: { filter: "kinds" | "retailers" | "radius"; value: string }
  /** A place's details opened: from the results list, a search, the map, or "Also nearby". */
  details_open: { kind: string; from: "list" | "search" | "map" | "nearby" }
  directions_click: { kind: string }
  /** Add a place sent: stored, or held back as a possible duplicate. */
  add_place_submit: { kind: string; outcome: "sent" | "duplicate" | "error" }
  /** A question to the assistant; `turn` counts the conversation's questions. */
  assistant_query: { turn: number }
  sponsored_click: { placement: string; banner: string }
  sponsored_dismiss: { placement: string; banner: string }
}

/** Records a product event with the configured provider. */
export function track<K extends keyof ProductEvents>(event: K, props: ProductEvents[K]): void {
  sendEvent(publicConfig.analytics.provider, event, props)
}
