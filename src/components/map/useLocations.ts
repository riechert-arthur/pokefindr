"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { LocationFeatureCollection } from "@/lib/types/locations"

const EMPTY: LocationFeatureCollection = { type: "FeatureCollection", features: [] }

/** Loads the map's locations from GET /api/locations. */
export function useLocations() {
  const [collection, setCollection] = useState<LocationFeatureCollection>(EMPTY)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const controller = new AbortController()

    fetch("/api/locations", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load locations (${res.status})`)
        setCollection((await res.json()) as LocationFeatureCollection)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        const e = err instanceof Error ? err : new Error(String(err))
        console.error(e)
        setError(e)
        toast.error("Couldn't load vending machine locations. Please refresh to try again.")
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [])

  return { collection, isLoading, error }
}
