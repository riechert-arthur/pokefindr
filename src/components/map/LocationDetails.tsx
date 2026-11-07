"use client"

import { useState, type ComponentProps } from "react"
import { FlagIcon } from "lucide-react"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { toKind } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { DetailsSheet } from "./DetailsSheet"
import { ReportForm } from "./ReportForm"
import { ReviewSummary, ReviewsSection } from "./Reviews"
import { useLocationReviews } from "./useLocationReviews"
import { AlsoNearby, useAlsoNearby } from "./AlsoNearby"
import type { LocationFeature, LocationKind } from "@/lib/types/locations"

type LocationDetailsProps = Omit<ComponentProps<typeof DetailsSheet>, "summary" | "actions" | "top" | "children"> & {
  /** The map's filters, which "Also nearby" follows. */
  kinds: readonly LocationKind[]
  retailers: readonly string[] | null
  /** Opens another location's details (a row in "Also nearby"). */
  onOpen: (feature: LocationFeature) => void
}

/**
 * The details panel for one location with what belongs to it: its reviews,
 * "Report a problem" and the places nearby. Keyed by location, so state
 * resets per place.
 */
export function LocationDetails({ kinds, retailers, onOpen, ...props }: LocationDetailsProps) {
  const reviews = useLocationReviews(props.location.id)
  const { session } = useSessionContext()
  const [reporting, setReporting] = useState(false)
  const kind = toKind(props.location.kind)
  const nearby = useAlsoNearby(props.location, kinds, retailers)
  return (
    <DetailsSheet
      {...props}
      summary={<ReviewSummary reviews={reviews} />}
      actions={
        <Button type="button" variant="ghost" size="sm" aria-expanded={reporting} onClick={() => setReporting((on) => !on)}>
          <FlagIcon aria-hidden />
          Report a problem
        </Button>
      }
      top={reporting && <ReportForm locationId={props.location.id} kind={kind} signedIn={!!session} onClose={() => setReporting(false)} />}
    >
      <ReviewsSection kind={kind} reviews={reviews} username={session?.username ?? null} />
      <AlsoNearby rows={nearby} onOpen={onOpen} />
    </DetailsSheet>
  )
}
