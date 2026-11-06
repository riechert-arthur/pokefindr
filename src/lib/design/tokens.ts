/**
 * Runtime access to the design tokens in `src/app/globals.css`.
 *
 * Tailwind classes cover almost everything. This is for the few places that
 * need a concrete color string at runtime, mainly map paint properties, which
 * can't use `hsl(var(--token))`.
 */

/** Every color token defined in globals.css, in light and dark. */
export const COLOR_TOKENS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring",
  "brand", "brand-2", "spark", "success", "warning",
  "kind-vending", "kind-shop", "kind-event", "me",
  "map-water", "map-land", "map-line", "map-unsupported", "map-unsupported-line", "map-choro-hi", "map-dot-ring", "map-radius",
] as const

export type ColorToken = (typeof COLOR_TOKENS)[number]

export type LocationKind = "vending" | "shop" | "event"

/** The token for a location kind's color. */
export const kindToken = (kind: LocationKind): ColorToken => `kind-${kind}`

/**
 * Turns a token's HSL channels (`"221.2 83.2% 53.3%"`) into a CSS color with
 * commas (`"hsl(221.2, 83.2%, 53.3%)"`), which map libraries can parse.
 * Returns undefined for an empty or malformed value.
 */
export function channelsToHsl(channels: string): string | undefined {
  const parts = channels.trim().split(/\s+/)
  if (parts.length !== 3) return undefined
  return `hsl(${parts[0]}, ${parts[1]}, ${parts[2]})`
}

/**
 * Reads a token's current value (it changes with the theme) as a CSS color.
 * Pass an element inside the themed tree when you have one; defaults to <html>.
 * Falls back to `fallback` during SSR or if the token is missing.
 */
export function readToken(token: ColorToken, fallback = "hsl(0, 0%, 50%)", el?: Element): string {
  if (typeof window === "undefined") return fallback
  const value = getComputedStyle(el ?? document.documentElement).getPropertyValue(`--${token}`)
  return channelsToHsl(value) ?? fallback
}
