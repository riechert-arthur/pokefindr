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

/** A token value: hue, saturation % and lightness % (`"221.2 83.2% 53.3%"`). */
export const HSL_CHANNELS = /^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%$/

/** Used when a token can't be read: mid gray, or black for text tokens so text still reads on gray. */
const FALLBACK = "hsl(0, 0%, 50%)"
const TEXT_FALLBACK = "hsl(0, 0%, 0%)"
const defaultFallback = (token: ColorToken) => (/(^|-)foreground$/.test(token) ? TEXT_FALLBACK : FALLBACK)

/**
 * Turns a token's HSL channels (`"221.2 83.2% 53.3%"`) into a CSS color with
 * commas (`"hsl(221.2, 83.2%, 53.3%)"`), which map libraries can parse.
 * Returns undefined for an empty or malformed value.
 */
export function channelsToHsl(channels: string): string | undefined {
  const value = channels.trim()
  if (!HSL_CHANNELS.test(value)) return undefined
  const [h, s, l] = value.split(/\s+/)
  return `hsl(${h}, ${s}, ${l})`
}

/**
 * Reads several tokens' current values (they change with the theme) as CSS
 * colors, with one style lookup. Pass an element inside the themed tree when
 * you have one; defaults to <html>. A token that is missing or malformed, or
 * any token during SSR, gets `fallback`. Without one, text tokens
 * (`*-foreground`) fall back to black and the rest to mid gray, so text drawn
 * on a fallback fill stays readable.
 */
export function readTokens<T extends ColorToken>(
  tokens: readonly T[],
  fallback?: string,
  el?: Element,
): Record<T, string> {
  const style = typeof window === "undefined" ? undefined : getComputedStyle(el ?? document.documentElement)
  const colors = {} as Record<T, string>
  for (const token of tokens) {
    colors[token] = (style && channelsToHsl(style.getPropertyValue(`--${token}`))) ?? fallback ?? defaultFallback(token)
  }
  return colors
}

/** Reads one token's current value as a CSS color. See `readTokens`. */
export function readToken(token: ColorToken, fallback?: string, el?: Element): string {
  return readTokens([token], fallback, el)[token]
}
