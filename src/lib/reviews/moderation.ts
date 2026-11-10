import type { ModerationCategory, ModerationVerdict } from "@/server/ports/moderator"

export type { ModerationCategory, ModerationVerdict }

/**
 * Who sees a review (#253): everyone once published; only its author while
 * it's held for a moderator or after a moderator removed it.
 */
export const REVIEW_STATUSES = ["published", "held", "removed"] as const
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]

/** What the moderators' queue says about each category. */
export const CATEGORY_LABELS: Record<ModerationCategory, string> = {
  harassment: "Harassment",
  threat: "Threat",
  sexual: "Sexual",
  personal_info: "Personal details",
  spam: "Spam or ads",
  scalping: "Scalping",
  injection: "Injection",
  off_topic: "Off topic",
}

/** One automatic check, as moderators see it. */
export interface TextCheck {
  verdict: ModerationVerdict
  categories: ModerationCategory[]
  reason: string
  model: string
  /** The check didn't run; the verdict is the fallback. */
  failed: boolean
  at: string
}

/** The check stored on a submission (location_submissions.text_check). */
export type SubmissionTextCheck = TextCheck

/** A review in the moderators' Reviews tab (GET /api/admin/reviews). */
export interface HeldReview {
  id: string
  rating: number
  text: string
  status: ReviewStatus
  author: string
  /** The viewer wrote it: a moderator can't decide their own (an admin can). */
  writtenByViewer: boolean
  createdAt: string
  location: { id: string; name: string; city: string; state: string; kind: string }
  /** The latest automatic check, or null when none ran. */
  check: TextCheck | null
  moderatedBy: string | null
  moderatedAt: string | null
}
