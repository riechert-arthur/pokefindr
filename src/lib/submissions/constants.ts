/**
 * Self-service submissions (R4): someone adds a card shop or an event, a
 * moderator approves or rejects it. Shared by the server and the UI.
 */

/** What people can add themselves. Vending machines come from the retailer list and admins (#155). */
export const SUBMISSION_KINDS = ["shop", "event"] as const
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number]

export const SUBMISSION_STATUSES = ["pending", "approved", "rejected"] as const
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number]

/** Why a moderator rejected a submission; the submitter sees the label. */
export const REJECT_REASONS = ["duplicate", "not_real", "wrong_details", "spam"] as const
export type RejectReason = (typeof REJECT_REASONS)[number]

export const REJECT_REASON_LABELS: Record<RejectReason, string> = {
  duplicate: "Duplicate of an existing place",
  not_real: "Not a real or public place",
  wrong_details: "Details are wrong",
  spam: "Spam",
}

/** What a card shop sells, as the details step offers it. */
export const SHOP_SELLS = ["singles", "sealed", "supplies", "events"] as const
export type ShopSells = (typeof SHOP_SELLS)[number]

export const SHOP_SELLS_LABELS: Record<ShopSells, string> = {
  singles: "Singles",
  sealed: "Sealed product",
  supplies: "Supplies",
  events: "Plays events",
}
