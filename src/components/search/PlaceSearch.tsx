"use client"

import { useMemo, useState, type ReactNode } from "react"
import { MapIcon, MapPinIcon } from "lucide-react"
import { track } from "@/lib/analytics"
import { SearchCommand, type SearchCommandItem } from "@/components/pokefindr/SearchCommand"
import { KindDot } from "@/components/pokefindr/KindDot"
import { toKind } from "@/components/pokefindr/kinds"
import { MIN_QUERY_LENGTH } from "@/lib/geocode/query"
import type { GeocodeResult } from "@/lib/geocode/client"
import { LOCATION_KINDS, type LocationFeature, type LocationKind } from "@/lib/types/locations"
import { AREA_COUNT_RADIUS, useSearch } from "./useSearch"
import { useFormat } from "@/i18n/format"
import { useDistance } from "@/i18n/useDistance"
import { useTranslations } from "next-intl"

const areaId = (i: number, a: GeocodeResult) => `area-${i}-${a.label}`

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
  /** Vending retailers to count and list, as the map's `retailer=`; all by default. */
  retailers?: readonly string[]
  /** Miles around each area to count: the radius a pick opens with. */
  radius?: number
  /** [lng, lat] to rank nearby areas and locations first. */
  near?: [number, number]
  /** Also list our own locations whose name or address matches (the map does; the landing page doesn't). */
  locations?: boolean
  onClear?: () => void
  leading?: ReactNode
  placement?: "auto" | "below"
  className?: string
}

/** SearchCommand with live results: areas from /api/geocode with counts, and matching locations. */
export function PlaceSearch({ kinds = LOCATION_KINDS, retailers, radius = AREA_COUNT_RADIUS, near, locations = false, onPick, onQueryChange, ...props }: PlaceSearchProps) {
  const f = useFormat()
  const { radius: radiusText } = useDistance()
  const t = useTranslations("map.search")
  const tk = useTranslations("kinds")
  // Searches only what the viewer typed: a label the caller put in the box
  // (the map's current place) isn't a question, and neither is the text
  // left in the box after a pick: panning the map doesn't search again.
  const [typed, setTyped] = useState<string | null>(null)
  const results = useSearch(typed === props.query ? props.query : "", { kinds, retailers, radius, near, locations })

  const items = useMemo<SearchCommandItem[]>(
    () => [
      ...results.areas.map((a, i) => ({
        // With the label, so a new list (not new counts) gets new ids.
        id: areaId(i, a),
        group: "areas" as const,
        label: a.label,
        meta: a.count === null ? undefined : a.kind === "state" ? f.places(a.count, kinds) : t("areaWithin", { places: f.places(a.count, kinds), radius: radiusText(radius) }),
        icon: a.kind === "state" ? <MapIcon aria-hidden className="size-4 shrink-0" /> : <MapPinIcon aria-hidden className="size-4 shrink-0" />,
      })),
      ...results.locations.map((loc) => {
        const kind = toKind(loc.properties.kind)
        const { retailer, address, city } = loc.properties
        return {
          id: `location-${loc.properties.id}`,
          group: "locations" as const,
          label: retailer,
          detail: [address, city].filter(Boolean).join(", "),
          meta: tk(`${kind}.name`),
          icon: <KindDot kind={kind} />,
        }
      }),
    ],
    [results, kinds, radius, f, radiusText, t, tk],
  )

  const pick = (id: string) => {
    setTyped(null)
    const from = props.variant === "hero" ? "landing" : "map"
    const area = results.areas.find((a, i) => areaId(i, a) === id)
    if (area) {
      track("search", { result: area.kind, from })
      return onPick({ type: "area", area })
    }
    const feature = results.locations.find((f) => `location-${f.properties.id}` === id)
    if (feature) {
      track("search", { result: "location", from })
      onPick({ type: "location", feature })
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
