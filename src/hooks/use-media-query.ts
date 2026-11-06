"use client"

import { useEffect, useState } from "react"

/**
 * True while `query` matches. Returns `defaultValue` during SSR and the first
 * client render, then follows the media query.
 */
export function useMediaQuery(query: string, defaultValue = false): boolean {
  const [matches, setMatches] = useState(defaultValue)

  useEffect(() => {
    const mql = window.matchMedia(query)
    const update = () => setMatches(mql.matches)
    update()
    mql.addEventListener("change", update)
    return () => mql.removeEventListener("change", update)
  }, [query])

  return matches
}

/** Tailwind's `md` breakpoint: desktop-style panels from here up. */
export const MD_UP = "(min-width: 768px)"
