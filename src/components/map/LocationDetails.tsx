"use client"

import { useRef, useState, type ComponentProps } from "react"
import { FlagIcon } from "lucide-react"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { toKind } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { DetailsSheet } from "./DetailsSheet"
import { ReportForm } from "./ReportForm"
import { ReviewSummary, ReviewsSection } from "./Reviews"
import { useLocationReviews } from "./useLocationReviews"

type LocationDetailsProps = Omit<ComponentProps<typeof DetailsSheet>, "summary" | "actions" | "top" | "children">

/**
 * The details panel for one location with what belongs to it: its reviews
 * and "Report a problem". Keyed by location, so state resets per place.
 */
export function LocationDetails(props: LocationDetailsProps) {
  const reviews = useLocationReviews(props.location.id)
  const { session } = useSessionContext()
  const [reporting, setReporting] = useState(false)
  const reportButton = useRef<HTMLButtonElement>(null)
  // The form's buttons go away with it: focus goes back to Report a problem.
  const closeReport = () => {
    setReporting(false)
    reportButton.current?.focus()
  }
  const kind = toKind(props.location.kind)
  return (
    <DetailsSheet
      {...props}
      summary={<ReviewSummary reviews={reviews} />}
      actions={
        <Button ref={reportButton} type="button" variant="ghost" size="sm" aria-expanded={reporting} onClick={() => setReporting((on) => !on)}>
          <FlagIcon aria-hidden />
          Report a problem
        </Button>
      }
      top={reporting && <ReportForm locationId={props.location.id} kind={kind} signedIn={!!session} onClose={closeReport} />}
    >
      <ReviewsSection kind={kind} reviews={reviews} username={session?.username ?? null} placeName={props.location.retailer} />
    </DetailsSheet>
  )
}
