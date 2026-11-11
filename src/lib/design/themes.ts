/**
 * The app's themes (#371), as next-themes and the theme pickers know them.
 * Each is a class on <html>. Holo Dark builds on the dark tokens, so it counts
 * as dark wherever the app asks (Tailwind's `dark:`, useIsDark, the map).
 */
export const THEMES = ["light", "dark", "holo-light", "holo-dark"] as const
export type Theme = (typeof THEMES)[number]

/** The themes whose tokens and styles are dark. */
export const DARK_THEMES: readonly Theme[] = ["dark", "holo-dark"]

/** Light or dark, for whatever only knows those two (the toaster, native controls). */
export const lightOrDark = (theme: string | undefined): "light" | "dark" | undefined =>
  theme === undefined || theme === "system" ? undefined : (DARK_THEMES as readonly string[]).includes(theme) ? "dark" : "light"
