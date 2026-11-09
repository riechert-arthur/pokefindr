"use client"

import { KindDot } from "@/components/pokefindr/KindDot"
import { toKind } from "@/components/pokefindr/kinds"
import type { LocationFeature } from "@/lib/types/locations"
import { useDistance } from "@/i18n/useDistance"

/** A row's second line: the street address and city, or the city and state. */
const where = ({ address, city, state }: LocationFeature["properties"]) => (address ? [address, city] : [city, state]).filter(Boolean).join(", ")

interface LocationRowProps {
  feature: LocationFeature
  /** Miles away, shown on the right. */
  distance?: number
  selected?: boolean
  onOpen: (feature: LocationFeature) => void
}

/** One location in a list (results, Also nearby): its kind dot, name, address and distance. Opens its details. */
export function LocationRow({ feature, distance, selected, onOpen }: LocationRowProps) {
  const { distance: miles } = useDistance()
  const p = feature.properties
  return (
    <button
      type="button"
      onClick={() => onOpen(feature)}
      aria-current={selected ? "true" : undefined}
      className="flex w-full items-start gap-2.5 rounded-lg p-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-[current=true]:bg-muted"
    >
      <KindDot kind={toKind(p.kind)} className="mt-px" />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-foreground">{p.retailer}</span>
        <span className="block truncate text-body text-muted-foreground">{where(p)}</span>
      </span>
      {distance !== undefined && <span className="whitespace-nowrap pt-0.5 text-caption tabular-nums text-muted-foreground">{miles(distance)}</span>}
    </button>
  )
}
