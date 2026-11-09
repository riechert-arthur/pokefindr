"use client"

import { Fragment } from "react"
import { EmptyState } from "@/components/pokefindr/EmptyState"
import { KIND_ORDER, countLabel, formatCount, placesLabel } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { RADII } from "@/lib/map/url-state"
import type { LocationFeature, LocationKind, NearbyLocations } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import type { NearbyState } from "./useNearbyLocations"
import { LocationRow } from "./LocationRow"
import { SponsoredPlacement } from "@/components/ads/SponsoredPlacement"

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
export function breakdown(counts: NearbyLocations["counts"], kinds: readonly LocationKind[]): string {
  return KIND_ORDER.filter((k) => kinds.includes(k) && counts[k])
    .map((k) => countLabel(k, counts[k]!))
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
  const near = label ?? "you"
  const wider = RADII.find((r) => r > radius)

  return (
    <>
      <div className="flex flex-col gap-2.5 border-b border-border px-4 pb-2.5 pt-3.5">
        <div aria-live="polite" aria-atomic>
          <h2 className="text-subheading text-foreground">
            {fresh ? `${placesLabel(fresh.total, kinds)} near ${near}` : `Places near ${near}`}
          </h2>
          <p className="text-body text-muted-foreground">
            {fresh && fresh.total > 0
              ? breakdown(fresh.counts, kinds)
              : `Sorted by distance from ${label ? "the center" : "you"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-body text-muted-foreground" id="results-radius">
            Within
          </span>
          <ToggleGroup
            type="single"
            required
            value={String(radius)}
            onValueChange={(v) => onRadiusChange(Number(v) as Radius)}
            aria-labelledby="results-radius"
            className="gap-0 overflow-hidden rounded-md border border-border"
          >
            {RADII.map((r) => (
              <ToggleGroupItem
                key={r}
                value={String(r)}
                className="h-7 rounded-none border-r border-border bg-background px-2.5 text-body font-normal tabular-nums text-foreground last:border-r-0 hover:bg-muted hover:text-foreground data-[state=on]:bg-foreground data-[state=on]:text-background"
              >
                {r} mi
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </div>

      <div className={cn("min-h-0 overflow-y-auto p-1.5", status === "loading" && results && "opacity-60 transition-opacity")}>
        {status === "error" ? (
          <EmptyState title="Couldn't load these results" className="m-1.5" action={<Button size="sm" variant="outline" onClick={nearby.reload}>Try again</Button>}>
            Check your connection and try again.
          </EmptyState>
        ) : !results || (stale && results.features.length === 0) ? (
          <div aria-label="Loading results" className="flex flex-col gap-1 p-1">
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
            title={`Nothing within ${radius} mi`}
            className="m-1.5"
            action={wider && <Button size="sm" variant="outline" onClick={() => onRadiusChange(wider)}>Widen to {wider} mi</Button>}
          >
            Try a wider radius or turn on more types.
          </EmptyState>
        ) : (
          <ul aria-label={`Places near ${near}, closest first`}>
            {results.features.map((f, i) => (
              <Fragment key={f.properties.id}>
                <li>
                  <LocationRow feature={f} distance={f.properties.distance} selected={selectedId === f.properties.id} onOpen={onOpen} />
                </li>
                {/* One sponsored card after the third place (#136), only when more places follow. */}
                {i === 2 && results.features.length > 3 && (
                  <li>
                    <SponsoredPlacement placement="results" className="my-1.5" />
                  </li>
                )}
              </Fragment>
            ))}
            {results.truncated && (
              <li className="px-2.5 py-3 text-caption text-muted-foreground">
                Showing the closest {formatCount(results.features.length)} of {formatCount(results.total)}.
              </li>
            )}
          </ul>
        )}
      </div>
    </>
  )
}
