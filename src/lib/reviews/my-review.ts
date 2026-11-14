import type { ReviewStatus } from "@/lib/reviews/moderation"

/** One of the signed-in user's own reviews, as `/api/my-reviews` returns it (newest first). */
export interface MyReview {
  id: string
  rating: number
  comment: string | null
  /** When it was written, as an ISO date. */
  created: string | null
  /** "held" until a moderator approves it, "removed" if one took it down (#253). */
  status: ReviewStatus
  /** The reviewed place. An imported machine has no name, so `name` is its retailer. */
  location: { id: string; name: string | null; description: string | null; city: string | null; state: string | null }
}
