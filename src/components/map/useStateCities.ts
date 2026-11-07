"use client"

import { useCallback, useEffect, useState } from "react"
import { LOCATION_KINDS, type LocationKind, type StateCities } from "@/lib/types/locations"

export interface StateCitiesState {
  status: "idle" | "loading" | "ready" | "error"
  /** The state these are for; kept while the next state loads. */
  state: string | null
  cities: StateCities | null
  reload: () => void
}

/** A state's busiest cities for the shown kinds (GET /api/locations/cities). */
export function useStateCities(state: string | null, kinds: readonly LocationKind[]): StateCitiesState {
  const [data, setData] = useState<Omit<StateCitiesState, "reload">>({ status: "idle", state: null, cities: null })
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const types = kinds.length === LOCATION_KINDS.length ? null : kinds.join(",")

  useEffect(() => {
    if (!state) {
      setData({ status: "idle", state: null, cities: null })
      return
    }
    const params = new URLSearchParams({ state })
    if (types !== null) params.set("types", types)
    const controller = new AbortController()
    setData((d) => ({ ...d, status: "loading" }))
    fetch(`/api/locations/cities?${params}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/locations/cities failed (${res.status})`)
        const cities = (await res.json()) as StateCities
        if (!controller.signal.aborted) setData({ status: "ready", state, cities })
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        console.error("[map] couldn't load the state's cities", err)
        setData((d) => ({ ...d, status: "error" }))
      })
    return () => controller.abort()
  }, [state, types, attempt])

  return { ...data, reload }
}
