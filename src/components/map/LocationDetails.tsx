"use client"

import type { ComponentProps } from "react"
import { useSessionContext } from "@/components/providers/SessionProvider"
import { toKind } from "@/components/pokefindr/kinds"
import { DetailsSheet } from "./DetailsSheet"
import { ReviewSummary, ReviewsSection } from "./Reviews"
import { useLocationReviews } from "./useLocationReviews"

type LocationDetailsProps = Omit<ComponentProps<typeof DetailsSheet>, "summary" | "actions" | "top" | "children">

/** The details panel for one location with what loads for it: its reviews. Keyed by location, so state resets per place. */
export function LocationDetails(props: LocationDetailsProps) {
  const reviews = useLocationReviews(props.location.id)
  const { session } = useSessionContext()
  return (
    <DetailsSheet {...props} summary={<ReviewSummary reviews={reviews} />}>
      <ReviewsSection kind={toKind(props.location.kind)} reviews={reviews} username={session?.username ?? null} />
    </DetailsSheet>
  )
}
