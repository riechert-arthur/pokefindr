/**
 * Breakpoints shared by Tailwind (theme.screens in tailwind.config.ts) and the
 * JS media-query hooks, so md:/lg: classes and useMediaQuery flip together.
 * These are Tailwind's defaults.
 */
export const SCREENS = {
  sm: "640px",
  md: "768px",
  lg: "1024px",
  xl: "1280px",
  "2xl": "1536px",
} as const

export const minWidth = (screen: keyof typeof SCREENS) => `(min-width: ${SCREENS[screen]})`
