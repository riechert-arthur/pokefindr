"use client"

import { useCallback, useSyncExternalStore } from "react"
import { minWidth } from "@/lib/design/breakpoints"

// One MediaQueryList per query, so snapshots don't re-parse the query.
const lists = new Map<string, MediaQueryList>()
const list = (query: string) => {
  let mql = lists.get(query)
  if (!mql) {
    mql = window.matchMedia(query)
    lists.set(query, mql)
  }
  return mql
}

/**
 * True while `query` matches. Components that mount on the client read the
 * real value on their first render. During SSR and hydration it's
 * `defaultValue`, or undefined when none is given, so a caller can tell
 * "not known yet" apart from "doesn't match".
 */
export function useMediaQuery(query: string): boolean | undefined
export function useMediaQuery(query: string, defaultValue: boolean): boolean
export function useMediaQuery(query: string, defaultValue?: boolean): boolean | undefined {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = list(query)
      // Safari before 14 only has the older addListener/removeListener.
      if (mql.addEventListener) {
        mql.addEventListener("change", onChange)
        return () => mql.removeEventListener("change", onChange)
      }
      mql.addListener(onChange)
      return () => mql.removeListener(onChange)
    },
    [query],
  )
  return useSyncExternalStore(
    subscribe,
    () => list(query).matches,
    () => defaultValue,
  )
}

/** Tailwind's `md` breakpoint: desktop-style panels from here up. */
export const MD_UP = minWidth("md")

/** Tailwind's `lg` breakpoint: the full header nav from here up. */
export const LG_UP = minWidth("lg")

/** For tests that stub matchMedia between cases. */
export function resetMediaQueryCache() {
  lists.clear()
}
