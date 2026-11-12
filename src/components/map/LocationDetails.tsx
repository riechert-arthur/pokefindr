"use client"

import { useEffect, useRef, useState, type ComponentProps } from "react"
import { FlagIcon } from "lucide-react"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { can } from "@/lib/auth/entitlements"
import { toKind } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { DetailsSheet } from "./DetailsSheet"
import { ReportForm } from "./ReportForm"
import { SponsoredPlacement } from "@/components/ads/SponsoredPlacement"
import { ReviewSummary, ReviewsSection } from "./Reviews"
import { useLocationReviews } from "./useLocationReviews"
import { AlsoNearby, useAlsoNearby } from "./AlsoNearby"
import type { LocationFeature, LocationKind } from "@/lib/types/locations"
import { useTranslations } from "next-intl"

type LocationDetailsProps = Omit<ComponentProps<typeof DetailsSheet>, "summary" | "actions" | "top" | "children"> & {
  /** The map's filters, which "Also nearby" follows. */
  kinds: readonly LocationKind[]
  retailers: readonly string[] | null
  /** Opens another location's details (a row in "Also nearby"). */
  onOpen: (feature: LocationFeature) => void
}

/**
 * A shop's website (#399), from GET /api/locations/<id>, unless the location
 * already came from that route (a shared link: `known` is set). The map's
 * bulk results leave it out. Undefined while it loads, or for other kinds;
 * null when the shop has none or the request failed (the row is then left
 * out). The panel is keyed by location, so this state is per place.
 */
function useShopWebsite(id: string, kind: LocationKind, known: string | null | undefined): string | null | undefined {
  const [fetched, setFetched] = useState<string | null | undefined>(undefined)
  const needed = kind === "shop" && known === undefined
  useEffect(() => {
    if (!needed) return
    const ctl = new AbortController()
    fetch(`/api/locations/${encodeURIComponent(id)}`, { signal: ctl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<LocationFeature>) : null))
      .then((feature) => setFetched(feature?.properties.website ?? null))
      .catch(() => {
        if (!ctl.signal.aborted) setFetched(null)
      })
    return () => ctl.abort()
  }, [id, needed])
  return needed ? fetched : known
}

/**
 * The details panel for one location with what belongs to it: its reviews,
 * "Report a problem" and the places nearby. Keyed by location, so state
 * resets per place.
 */
export function LocationDetails({ kinds, retailers, onOpen, ...props }: LocationDetailsProps) {
  const reviews = useLocationReviews(props.location.id)
  const t = useTranslations("details")
  const { session } = useSessionContext()
  const [reporting, setReporting] = useState(false)
  const reportButton = useRef<HTMLButtonElement>(null)
  // The form's buttons go away with it: focus goes back to Report a problem.
  const closeReport = () => {
    setReporting(false)
    reportButton.current?.focus()
  }
  const kind = toKind(props.location.kind)
  const nearby = useAlsoNearby(props.location, kinds, retailers)
  const website = useShopWebsite(props.location.id, kind, props.location.website)
  return (
    <DetailsSheet
      {...props}
      location={{ ...props.location, website }}
      summary={<ReviewSummary reviews={reviews} />}
      actions={
        <Button ref={reportButton} type="button" variant="ghost" size="sm" aria-expanded={reporting} onClick={() => setReporting((on) => !on)}>
          <FlagIcon aria-hidden />
          {t("reportProblem")}
        </Button>
      }
      top={reporting && <ReportForm locationId={props.location.id} kind={kind} signedIn={!!session} onClose={closeReport} />}
    >
      {/* Never next to the report form (#136). */}
      {!reporting && <SponsoredPlacement placement="details" className="mt-3" />}
      <ReviewsSection kind={kind} reviews={reviews} username={session?.username ?? null} image={session?.image} moderate={can(session?.role, "moderation.avatars")} placeName={props.location.retailer} />
      <AlsoNearby rows={nearby} onOpen={onOpen} />
    </DetailsSheet>
  )
}
