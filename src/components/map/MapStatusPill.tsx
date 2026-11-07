import { placesLabel } from "@/components/pokefindr/kinds"
import type { LocationKind } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import type { ViewportStatus } from "./useViewportLocations"

export { placesLabel }

/** What the pill says, as plain text: also what screen readers hear once the view settles. */
export function statusText({ zoomedOut, total, inView, status, truncated, kinds }: Omit<MapStatusPillProps, "className">): string | null {
  if (zoomedOut) return total === null ? null : `${placesLabel(total, kinds)} in the US · Zoom in or pick a state to see them`
  if (status === "error") return "Couldn't load this area · Move the map to try again"
  if (status === "idle" || (status === "loading" && inView === 0)) return "Loading this area…"
  if (status === "loading") return `${placesLabel(inView, kinds)} in view · updating…`
  return `${placesLabel(inView, kinds, truncated)} in view · ${truncated ? "zoom in to see them all" : "loaded for this area"}`
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
export function MapStatusPill(props: MapStatusPillProps) {
  const { zoomedOut, total, inView, status, truncated, kinds, className } = props
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
  } else if (status === "idle" || (status === "loading" && inView === 0)) {
    // Zoomed in but this view hasn't loaded yet (the hook waits for the map to settle).
    content = <span className="text-muted-foreground">Loading this area…</span>
  } else {
    const loading = status === "loading"
    content = (
      <>
        <span className={cn("size-2 rounded-full", loading ? "bg-muted-foreground" : "bg-success")} aria-hidden />
        {placesLabel(inView, kinds, truncated && !loading)} in view{" "}
        <span className="text-muted-foreground">
          · {loading ? "updating…" : truncated ? "zoom in to see them all" : "loaded for this area"}
        </span>
      </>
    )
  }
  // Screen readers hear the settled result once per view, not every loading step.
  const settled = zoomedOut || status === "ready" || status === "error"
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "pointer-events-none absolute left-1/2 z-[8] flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-border bg-card px-3 py-[7px] text-[13px] text-card-foreground shadow-md",
          // The prototype puts it at the bottom on desktop; the floating affiliate
          // banner sits there until the ads redesign (R7), so it goes at the top,
          // where the prototype puts it on phones. MapInstance centers it beside the panel.
          "top-3 sm:top-4",
          className,
        )}
      >
        {content}
      </div>
      <span role="status" className="sr-only">
        {settled ? statusText(props) : ""}
      </span>
    </>
  )
}
