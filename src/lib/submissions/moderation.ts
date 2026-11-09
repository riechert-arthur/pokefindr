import type { RejectReason, SubmissionKind, SubmissionStatus } from "./constants"

/** A decision can be undone this long after it was made, by the moderator who made it. */
export const UNDO_MS = 60 * 60 * 1000

/** Whether the Undo for this decision is still allowed (the server checks again). */
export const canUndo = (reviewedAt: string | null, now = Date.now()) => reviewedAt !== null && now - Date.parse(reviewedAt) <= UNDO_MS

/** One automatic check on a submission, shown in the review queue. */
export interface ModerationCheck {
  key: "country" | "duplicate" | "address" | "website" | "date"
  ok: boolean
  label: string
  detail?: string
}

/** A submission as the review queue shows it (GET /api/admin/submissions). */
export interface ModerationItem {
  id: string
  kind: SubmissionKind
  status: SubmissionStatus
  rejectReason: RejectReason | null
  /** What the submitter filled in: name, address, city, state, and the kind's own fields. */
  fields: {
    name?: string
    address?: string
    city?: string
    state?: string
    website?: string
    hours?: string
    sells?: string[]
    venue?: string
    startsAt?: string
    endsAt?: string
    link?: string
    isFree?: boolean
  }
  lng: number
  lat: number
  /** Usernames. */
  submittedBy: string
  reviewedBy: string | null
  createdAt: string
  reviewedAt: string | null
  locationId: string | null
  /** Pending ones only. */
  checks: ModerationCheck[]
  /** The viewer sent it: a moderator can't decide their own (an admin can). */
  sentByViewer: boolean
}
