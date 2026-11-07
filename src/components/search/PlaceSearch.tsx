"use client"

import { useMemo, useState, type ReactNode } from "react"
import { MapIcon, MapPinIcon } from "lucide-react"
import { SearchCommand, type SearchCommandItem } from "@/components/pokefindr/SearchCommand"
import { KindDot } from "@/components/pokefindr/KindDot"
import { kindName, placesLabel, toKind } from "@/components/pokefindr/kinds"
import { MIN_QUERY_LENGTH } from "@/lib/geocode/query"
import type { GeocodeResult } from "@/lib/geocode/client"
import { LOCATION_KINDS, type LocationFeature, type LocationKind } from "@/lib/types/locations"
import { AREA_COUNT_RADIUS, useSearch } from "./useSearch"

/** What the viewer picked: an area (city, ZIP, address or state) or one of our locations. */
export type PlacePick = { type: "area"; area: GeocodeResult } | { type: "location"; feature: LocationFeature }

interface PlaceSearchProps {
  query: string
  onQueryChange: (query: string) => void
  onPick: (pick: PlacePick) => void
  variant?: "hero" | "panel"
  placeholder: string
  /** Kinds counted and searched; every kind by default. */
  kinds?: readonly LocationKind[]
  /** [lng, lat] to rank nearby areas and locations first. */
  near?: [number, number]
  /** Also list our own locations whose name or address matches (the map does; the landing page doesn't). */
  locations?: boolean
  onClear?: () => void
  leading?: ReactNode
  className?: string
}

/** SearchCommand with live results: areas from /api/geocode with counts, and matching locations. */
export function PlaceSearch({ kinds = LOCATION_KINDS, near, locations = false, onPick, onQueryChange, ...props }: PlaceSearchProps) {
  // Searches only what the viewer typed: a label the caller put in the box
  // (the map's current place) isn't a question.
  const [typed, setTyped] = useState<string | null>(null)
  const results = useSearch(typed === props.query ? props.query : "", { kinds, near, locations })

  const items = useMemo<SearchCommandItem[]>(
    () => [
      ...results.areas.map((a, i) => ({
        id: `area-${i}`,
        group: "areas" as const,
        label: a.label,
        meta: a.count === null ? undefined : a.kind === "state" ? placesLabel(a.count, kinds) : `${placesLabel(a.count, kinds)} within ${AREA_COUNT_RADIUS} mi`,
        icon: a.kind === "state" ? <MapIcon aria-hidden className="size-4 shrink-0" /> : <MapPinIcon aria-hidden className="size-4 shrink-0" />,
      })),
      ...results.locations.map((f) => {
        const kind = toKind(f.properties.kind)
        const { retailer, address, city } = f.properties
        return {
          id: `location-${f.properties.id}`,
          group: "locations" as const,
          label: retailer,
          detail: [address, city].filter(Boolean).join(", "),
          meta: kindName(kind),
          icon: <KindDot kind={kind} />,
        }
      }),
    ],
    [results, kinds],
  )

  const pick = (id: string) => {
    if (id.startsWith("area-")) {
      const area = results.areas[Number(id.slice("area-".length))]
      if (area) onPick({ type: "area", area })
    } else {
      const feature = results.locations.find((f) => `location-${f.properties.id}` === id)
      if (feature) onPick({ type: "location", feature })
    }
  }

  return (
    <SearchCommand
      {...props}
      onQueryChange={(q) => {
        setTyped(q)
        onQueryChange(q)
      }}
      items={items}
      status={results.status}
      onPick={pick}
      minLength={MIN_QUERY_LENGTH}
    />
  )
}
