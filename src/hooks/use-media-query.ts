"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * True while `query` matches. Components that mount on the client read the
 * real value on their first render; during SSR and hydration it's
 * `defaultValue`, then it follows the media query.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => defaultValue,
  )
}

/** Tailwind's `md` breakpoint: desktop-style panels from here up. */
export const MD_UP = "(min-width: 768px)"

/** Tailwind's `lg` breakpoint: the full header nav from here up. */
export const LG_UP = "(min-width: 1024px)"
