"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { LocationFeatureCollection } from "@/lib/types/locations"
import { useTranslations } from "next-intl"

const EMPTY: LocationFeatureCollection = { type: "FeatureCollection", features: [] }

/** Loads the map's locations from GET /api/locations. */
export function useLocations() {
  const [collection, setCollection] = useState<LocationFeatureCollection>(EMPTY)
  const t = useTranslations("map")

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/locations", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load locations (${res.status})`)
        setCollection((await res.json()) as LocationFeatureCollection)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        console.error(err)
        toast.error(t("loadLocationsFailed"))
      })

    return () => controller.abort()
  }, [t])

  return collection
}
