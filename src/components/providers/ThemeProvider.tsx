"use client"

import type { ComponentProps } from "react"
import { ThemeProvider as NextThemesProvider } from "next-themes"

/**
 * Light/dark theme. Sets the `dark` class on <html>, which switches every
 * design token (src/app/globals.css). Follows the OS by default; the viewer's
 * choice is remembered in localStorage. `disableTransitionOnChange` avoids a
 * flash of half-transitioned colors when the theme flips.
 */
export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange {...props} />
}
