"use client"

import { useMemo, useSyncExternalStore } from "react"
import { useLocale } from "next-intl"
import { distanceUnit, formatDistance, formatRadius, type DistanceUnit } from "@/lib/format/distance"

const noSubscribe = () => () => {}

/** The browser's region, from its first language that has one ("es-MX" → kilometers). */
function viewerUnit(): DistanceUnit {
  const tags = [...(navigator.languages ?? []), navigator.language].filter((tag): tag is string => typeof tag === "string")
  return distanceUnit(tags.find((tag) => tag.includes("-")))
}

/**
 * Distances in the viewer's units: miles in the US, kilometers in most other
 * places (src/lib/format/distance.ts). The server doesn't know the region, so
 * it renders miles and the browser switches after hydration if it needs to.
 * Radii and distances stay in miles everywhere else.
 */
export function useDistance() {
  const locale = useLocale()
  const unit = useSyncExternalStore(noSubscribe, viewerUnit, () => distanceUnit(locale))
  return useMemo(
    () => ({
      unit,
      /** "0.4 mi", "0,6 km". */
      distance: (miles: number) => formatDistance(miles, locale, unit),
      /** "5 mi", "8 km": a search radius, in whole units. */
      radius: (miles: number) => formatRadius(miles, locale, unit),
    }),
    [locale, unit],
  )
}
