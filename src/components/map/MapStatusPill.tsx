import { countLabel, formatCount } from "@/components/pokefindr/kinds"
import type { LocationKind } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import type { ViewportStatus } from "./useViewportLocations"

/** "12 vending machines" when one kind is shown, "12 places" otherwise. */
export function placesLabel(n: number, kinds: readonly LocationKind[]): string {
  return kinds.length === 1 ? countLabel(kinds[0], n) : `${formatCount(n)} place${n === 1 ? "" : "s"}`
}

interface MapStatusPillProps {
  zoomedOut: boolean
  /** Locations of the shown kinds in the US, for the zoomed-out view. */
  total: number | null
  /** Locations loaded for the current view. */
  inView: number
  status: ViewportStatus
  truncated: boolean
  kinds: readonly LocationKind[]
  className?: string
}

/**
 * The pill at the bottom of the map that says what it's showing, worded as in
 * the redesign prototype.
 */
export function MapStatusPill({ zoomedOut, total, inView, status, truncated, kinds, className }: MapStatusPillProps) {
  let content: React.ReactNode
  if (zoomedOut) {
    if (total === null) return null
    content = (
      <>
        <span className="text-muted-foreground">{placesLabel(total, kinds)} in the US</span> · Zoom in or pick a state to see them
      </>
    )
  } else if (status === "error") {
    content = (
      <>
        <span className="size-2 rounded-full bg-destructive" aria-hidden />
        Couldn&apos;t load this area <span className="text-muted-foreground">· Move the map to try again</span>
      </>
    )
  } else if (status === "loading" && inView === 0) {
    content = <span className="text-muted-foreground">Loading this area…</span>
  } else {
    content = (
      <>
        <span className="size-2 rounded-full bg-success" aria-hidden />
        {truncated ? `${placesLabel(inView, kinds)}+` : placesLabel(inView, kinds)} in view{" "}
        <span className="text-muted-foreground">· {truncated ? "zoom in to see them all" : "loaded for this area"}</span>
      </>
    )
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-none absolute left-1/2 z-[8] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3 py-[7px] text-[13px] text-card-foreground shadow-md",
        // The prototype puts it at the bottom on desktop; the floating affiliate
        // banner sits there until the ads redesign (R7), so it goes at the top,
        // where the prototype puts it on phones.
        "top-4 max-md:top-[72px]",
        className,
      )}
    >
      {content}
    </div>
  )
}
