"use client"

import { Fragment } from "react"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { KIND_ORDER } from "@/components/pokefindr/kinds"
import { useFormat, type Format } from "@/i18n/format"
import { useDistance } from "@/i18n/useDistance"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { RADII } from "@/lib/map/url-state"
import type { LocationFeature, LocationKind, NearbyLocations } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import type { NearbyState } from "./useNearbyLocations"
import { LocationRow } from "./LocationRow"
import { SponsoredPlacement } from "@/components/ads/SponsoredPlacement"
import { useTranslations } from "next-intl"

type Radius = (typeof RADII)[number]

interface ResultsSheetProps {
  /** "Seattle, WA", or null for the viewer's own location. */
  label: string | null
  radius: Radius
  onRadiusChange: (radius: Radius) => void
  kinds: readonly LocationKind[]
  nearby: NearbyState
  /** Id of the selected location, highlighted in the list. */
  selectedId?: string
  onOpen: (feature: LocationFeature) => void
}

/** "41 vending machines · 1 card shop", in kind order. */
export function breakdown(counts: NearbyLocations["counts"], kinds: readonly LocationKind[], f: Format): string {
  return KIND_ORDER.filter((k) => kinds.includes(k) && counts[k])
    .map((k) => f.kindCount(k, counts[k]!))
    .join(" · ")
}


/**
 * The results for a place, as in the prototype's side sheet: how many are
 * near it by kind, the radius, and every location inside it, closest first.
 */
export function ResultsSheet({ label, radius, onRadiusChange, kinds, nearby, selectedId, onOpen }: ResultsSheetProps) {
  const { results, status, stale = false } = nearby
  // Counts only for results that match the radius and filters shown.
  const fresh = results && !stale ? results : null
  const t = useTranslations("map.results")
  const tm = useTranslations("map")
  const near = label ?? t("you")
  const wider = RADII.find((r) => r > radius)
  const f = useFormat()
  const { radius: radiusText } = useDistance()

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-border px-4 pb-2.5 pt-3.5">
        <div aria-live="polite" aria-atomic>
          <h2 className="text-subheading text-foreground">
            {fresh ? t("title", { places: f.places(fresh.total, kinds), place: near }) : t("titlePending", { place: near })}
          </h2>
          <p className="text-body text-muted-foreground">
            {fresh && fresh.total > 0
              ? breakdown(fresh.counts, kinds, f)
              : label ? t("sortedFromCenter") : t("sortedFromYou")}
          </p>
        </div>
      </div>

      <div className={cn("min-h-0 overflow-y-auto p-1.5", status === "loading" && results && "opacity-60 transition-opacity")}>
        {status === "error" ? (
          <EmptyState title={t("failed")} className="m-1.5" action={<Button size="sm" variant="outline" onClick={nearby.reload}>{t("tryAgain")}</Button>}>
            {tm("connection")}
          </EmptyState>
        ) : !results || (stale && results.features.length === 0) ? (
          <div aria-label={t("loading")} className="flex flex-col gap-1 p-1">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex gap-2.5 p-2.5">
                <Skeleton className="size-[1.375rem] rounded-full" />
                <div className="flex flex-1 flex-col gap-1.5">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-2/3" />
                </div>
              </div>
            ))}
          </div>
        ) : results.features.length === 0 ? (
          <EmptyState
            title={t("nothingWithin", { radius: radiusText(radius) })}
            className="m-1.5"
            action={wider && <Button size="sm" variant="outline" onClick={() => onRadiusChange(wider)}>{t("widen", { radius: radiusText(wider) })}</Button>}
          >
            {t("widenHint")}
          </EmptyState>
        ) : (
          <ul aria-label={t("listLabel", { place: near })}>
            {results.features.map((f, i) => (
              <Fragment key={f.properties.id}>
                <li>
                  <LocationRow feature={f} distance={f.properties.distance} selected={selectedId === f.properties.id} onOpen={onOpen} />
                </li>
                {/* One sponsored card after the third place (#136), only when more places follow. */}
                {i === 2 && results.features.length > 3 && <SponsoredPlacement placement="results" className="my-1.5" listItem />}
              </Fragment>
            ))}
            {results.truncated && (
              <li className="px-2.5 py-3 text-caption text-muted-foreground">
                {t("truncated", { shown: f.count(results.features.length), total: f.count(results.total) })}
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  )
}
