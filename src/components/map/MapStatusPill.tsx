import { useTranslations } from "next-intl"
import { useFormat, type Format } from "@/i18n/format"
import type { LocationKind } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import type { ViewportStatus } from "./useViewportLocations"

type StatusMessages = ReturnType<typeof useTranslations<"map.status">>

/** What the pill says, as plain text: also what screen readers hear once the view settles. */
export function statusText({ zoomedOut, total, inView, status, truncated, kinds }: Omit<MapStatusPillProps, "className">, f: Format, t: StatusMessages): string | null {
  if (zoomedOut) return total === null ? null : `${t("inUs", { places: f.places(total, kinds) })} · ${t("zoomIn")}`
  if (status === "error") return `${t("error")} · ${t("errorHint")}`
  if (status === "idle" || (status === "loading" && inView === 0)) return t("loadingArea")
  if (status === "loading") return `${t("inView", { places: f.places(inView, kinds) })} · ${t("updating")}`
  return `${t("inView", { places: f.places(inView, kinds, truncated) })} · ${truncated ? t("zoomForAll") : t("loaded")}`
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
  const f = useFormat()
  const t = useTranslations("map.status")
  let content: React.ReactNode
  if (zoomedOut) {
    if (total === null) return null
    content = (
      <>
        <span className="text-muted-foreground">{t("inUs", { places: f.places(total, kinds) })}</span> · {t("zoomIn")}
      </>
    )
  } else if (status === "error") {
    content = (
      <>
        <span className="size-2 rounded-full bg-destructive" aria-hidden />
        {t("error")} <span className="text-muted-foreground">· {t("errorHint")}</span>
      </>
    )
  } else if (status === "idle" || (status === "loading" && inView === 0)) {
    // Zoomed in but this view hasn't loaded yet (the hook waits for the map to settle).
    content = <span className="text-muted-foreground">{t("loadingArea")}</span>
  } else {
    const loading = status === "loading"
    content = (
      <>
        <span className={cn("size-2 rounded-full", loading ? "bg-muted-foreground" : "bg-success")} aria-hidden />
        {t("inView", { places: f.places(inView, kinds, truncated && !loading) })}{" "}
        <span className="text-muted-foreground">
          · {loading ? t("updating") : truncated ? t("zoomForAll") : t("loaded")}
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
        {settled ? statusText(props, f, t) : ""}
      </span>
    </>
  )
}
