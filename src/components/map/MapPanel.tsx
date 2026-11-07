"use client"

import { useEffect, useRef, type ReactNode } from "react"
import { TypeChip } from "@/components/pokefindr/TypeChip"
import { KIND_ORDER } from "@/components/pokefindr/kinds"
import type { LocationKind } from "@/lib/types/locations"

interface MapPanelProps {
  search: ReactNode
  /** Beside the search box: the Filters button. */
  filter?: ReactNode
  kinds: readonly LocationKind[]
  /** Each kind's US total, for the chips; null until loaded. */
  kindTotals: Partial<Record<LocationKind, number>> | null
  onKindsChange: (kinds: LocationKind[]) => void
  /** The card under the chips (results, a state, the US); none when null. */
  sheet: ReactNode
  /** Accessible name of the sheet. */
  sheetLabel?: string
}

/**
 * The prototype's left panel over the map: the search box, a chip per
 * location kind, and a card with the current view's list. On desktop it's
 * a 360px column down the left; on phones it sits at the bottom, at most
 * 55% of the height, and lifts the map's bottom controls above it.
 */
export function MapPanel({ search, filter, kinds, kindTotals, onKindsChange, sheet, sheetLabel }: MapPanelProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Phones: the bottom-right controls sit above the panel (CSS reads --map-panel-h).
  useEffect(() => {
    const el = ref.current
    const container = el?.closest<HTMLElement>(".maplibregl-map")
    if (!el || !container) return
    const observer = new ResizeObserver(() => container.style.setProperty("--map-panel-h", `${el.offsetHeight}px`))
    observer.observe(el)
    return () => {
      observer.disconnect()
      container.style.removeProperty("--map-panel-h")
    }
  }, [])

  const toggle = (kind: LocationKind, on: boolean) => {
    const next = KIND_ORDER.filter((k) => (k === kind ? on : kinds.includes(k)))
    // At least one kind stays on: the URL can't say "none", and an empty map helps no one.
    if (next.length) onKindsChange(next)
  }

  return (
    <div
      ref={ref}
      className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex max-h-[55%] flex-col gap-2 sm:inset-x-auto sm:bottom-3 sm:left-3 sm:top-3 sm:max-h-none sm:w-[360px]"
    >
      <div className="pointer-events-auto flex flex-none items-start gap-2">
        <div className="min-w-0 flex-1">{search}</div>
        {filter}
      </div>
      <div
        role="group"
        aria-label="What to show on the map"
        className="pointer-events-auto -m-px flex flex-none gap-1.5 overflow-x-auto p-px [scrollbar-width:none] sm:flex-wrap sm:overflow-visible"
      >
        {KIND_ORDER.map((k) => (
          <TypeChip
            key={k}
            kind={k}
            short
            count={kindTotals ? (kindTotals[k] ?? 0) : undefined}
            pressed={kinds.includes(k)}
            onPressedChange={(on) => toggle(k, on)}
          />
        ))}
      </div>
      {sheet && (
        <section
          aria-label={sheetLabel}
          className="pointer-events-auto flex min-h-0 flex-[0_1_auto] flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-md"
        >
          {sheet}
        </section>
      )}
    </div>
  )
}
