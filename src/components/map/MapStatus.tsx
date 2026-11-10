import type { ReactNode } from "react"
import { LoaderCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { MapFailure } from "./MapErrorBoundary"

interface MapStatusProps {
  /** "loading" while the map starts; "error" when it can't. */
  kind: "loading" | "error"
  children: ReactNode
  /** More text under the status, outside the live region. */
  detail?: ReactNode
  className?: string
}

/**
 * What fills the map area while the map loads or after it fails: muted,
 * centered text on the map's land color, as in the redesign prototype.
 */
export function MapStatus({ kind, children, detail, className }: MapStatusProps) {
  const t = useTranslations("map")
  return (
    <div
      className={cn(
        "grid size-full place-items-center bg-map-land p-6 text-center text-body text-muted-foreground",
        className,
      )}
    >
      <div className="flex max-w-sm flex-col items-center gap-3">
        <div role={kind === "error" ? "alert" : "status"} className="flex flex-col items-center gap-3">
          {kind === "loading" && <LoaderCircleIcon className="size-6 animate-spin text-primary" aria-hidden />}
          <p>{children}</p>
        </div>
        {detail}
        {kind === "error" && (
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            {t("reload")}
          </Button>
        )}
      </div>
    </div>
  )
}

/**
 * "Loading the map…" while the map starts, over what the map is for. That
 * paragraph is in the server's HTML, so it's the page's first large paint
 * (LCP) instead of the panel the map draws seconds later (#298). The /map
 * page's heading says the same to screen readers, so it's hidden from them.
 */
export function MapLoading({ className }: { className?: string }) {
  const t = useTranslations("map")
  return (
    <MapStatus kind="loading" className={className} detail={<p aria-hidden className="text-pretty">{t("meta.intro")}</p>}>
      {t("loading")}
    </MapStatus>
  )
}

/** Why the map couldn't start, worded as in the redesign prototype, with Reload. */
export function MapFailed({ failure, className }: { failure: MapFailure; className?: string }) {
  const t = useTranslations("map.failure")
  return (
    <MapStatus kind="error" className={className}>
      {t(failure)}
    </MapStatus>
  )
}
