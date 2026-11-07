"use client"

import { useEffect, useState } from "react"
import type { Highlights } from "@/lib/types/highlights"

/** Hotspots and upcoming events (GET /api/highlights); null until loaded, or if loading failed. */
export function useHighlights(): Highlights | null {
  const [highlights, setHighlights] = useState<Highlights | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    fetch("/api/highlights", { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET /api/highlights failed (${res.status})`)
        setHighlights((await res.json()) as Highlights)
      })
      .catch((err: unknown) => {
        // The map works without them.
        if (!controller.signal.aborted) console.error("[map] couldn't load highlights", err)
      })
    return () => controller.abort()
  }, [])
  return highlights
}
