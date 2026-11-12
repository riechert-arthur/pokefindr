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

interface ShopDetails {
  website: string | null
  hours: string | null
}

/**
 * A shop's website (#399) and hours (#401), from GET /api/locations/<id>:
 * the map's bulk results leave them out. Empty while it loads, or for other
 * kinds; null values when the shop has none or the request failed (the rows
 * are then left out).
 */
function useShopDetails(id: string, kind: LocationKind, known: Partial<ShopDetails>): Partial<ShopDetails> {
  const [fetched, setFetched] = useState<(ShopDetails & { id: string }) | null>(null)
  const needed = kind === "shop" && (known.website === undefined || known.hours === undefined)
  useEffect(() => {
    if (!needed) return
    const ctl = new AbortController()
    fetch(`/api/locations/${id}`, { signal: ctl.signal })
      .then((res) => (res.ok ? (res.json() as Promise<LocationFeature>) : null))
      .then((feature) => setFetched({ id, website: feature?.properties.website ?? null, hours: feature?.properties.hours ?? null }))
      .catch(() => {
        if (!ctl.signal.aborted) setFetched({ id, website: null, hours: null })
      })
    return () => ctl.abort()
  }, [id, needed])
  if (kind !== "shop") return {}
  if (!needed) return known
  return fetched?.id === id ? { website: fetched.website, hours: fetched.hours } : {}
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
  const shop = useShopDetails(props.location.id, kind, { website: props.location.website, hours: props.location.hours })
  return (
    <DetailsSheet
      {...props}
      location={{ ...props.location, ...shop }}
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
