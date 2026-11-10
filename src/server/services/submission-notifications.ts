import "server-only"
import { rolesWith } from "@/lib/auth/entitlements"
import { and, eq, inArray, isNull, lt } from "drizzle-orm"
import { z } from "zod/v3"
import { getDb, type Database } from "@/server/db/client"
import { locationSubmissions, profiles, sentNotifications, users } from "@/server/db/schema"
import { getMailer } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { submissionApproved, submissionRejected, submissionToReview, type EmailContent } from "@/server/email/templates"
import { defineJob } from "@/server/lib/jobs/types"
import { localizedPath } from "@/i18n/seo"
import type { Locale } from "@/i18n/routing"
import { serverTranslator, toLocale } from "@/server/i18n"
import { UNDO_MS } from "@/lib/submissions/moderation"

/** How long after a decision the submitter hears about it: past the undo window, so an undone decision sends nothing. */
export const REVIEWED_EMAIL_DELAY_SECONDS = UNDO_MS / 1000 + 5 * 60
/** A claim this old with no `sent_at` is from a run that died mid-send; the next run may take it. Longer than any send can take. */
export const STALE_CLAIM_MS = 10 * 60 * 1000

/** Another run holds the claim on this email and hasn't marked it sent. */
export class ClaimHeldError extends Error {
  constructor(readonly key: string) {
    super(`Another run is sending ${key}`)
    this.name = "ClaimHeldError"
  }
}

/**
 * Sends one email at most once for `key`: claims the key, sends, marks it
 * sent. If the send fails it gives the key back, so the job's retry sends
 * it; if the run dies mid-send, the claim goes stale and a later run takes
 * it. Returns whether it sent now.
 */
async function sendOnce(key: string, to: string, email: EmailContent, db: Database, now = new Date()): Promise<boolean> {
  const staleBefore = new Date(now.getTime() - STALE_CLAIM_MS)
  const claimed = await db
    .insert(sentNotifications)
    .values({ key, claimedAt: now })
    .onConflictDoUpdate({
      target: sentNotifications.key,
      set: { claimedAt: now },
      setWhere: and(isNull(sentNotifications.sentAt), lt(sentNotifications.claimedAt, staleBefore)),
    })
    .returning({ key: sentNotifications.key })
  if (!claimed.length) {
    const [held] = await db.select({ sentAt: sentNotifications.sentAt }).from(sentNotifications).where(eq(sentNotifications.key, key))
    if (held && !held.sentAt) {
      // Another run claimed it and hasn't sent yet, or died mid-send. Fail, so the queue retries
      // later: by then it's sent, or the claim is stale and this run takes it.
      throw new ClaimHeldError(key)
    }
    return false
  }
  try {
    await getMailer().send({ to, ...email })
  } catch (err) {
    // Only our own claim: a run that went stale must not give back the claim a newer run took.
    await db.delete(sentNotifications).where(and(eq(sentNotifications.key, key), isNull(sentNotifications.sentAt), eq(sentNotifications.claimedAt, now)))
    throw err
  }
  await db.update(sentNotifications).set({ sentAt: new Date() }).where(eq(sentNotifications.key, key))
  return true
}

async function loadSubmission(id: string, db: Database) {
  const [row] = await db
    .select({ s: locationSubmissions, submitter: profiles.username, email: users.email, locale: profiles.locale })
    .from(locationSubmissions)
    .innerJoin(profiles, eq(profiles.id, locationSubmissions.submittedBy))
    .innerJoin(users, eq(users.id, locationSubmissions.submittedBy))
    .where(eq(locationSubmissions.id, id))
  return row
}

type Payload = { name?: string; city?: string; state?: string }

/** A profile's language, or English when they haven't one. */

/**
 * Tells everyone with `moderation.notify` about a new submission, once each. Skips
 * one that's no longer pending (someone already decided it).
 */
export async function notifySubmissionCreated(submissionId: string, db: Database = getDb()): Promise<{ sent: number }> {
  const row = await loadSubmission(submissionId, db)
  if (!row || row.s.status !== "pending") return { sent: 0 }
  const p = row.s.payload as Payload
  const moderators = await db
    .select({ id: users.id, email: users.email, locale: profiles.locale })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.id))
    .where(inArray(profiles.role, rolesWith("moderation.notify")))
  // In each moderator's language (#185); the admin page itself is English.
  const email = (locale: Locale) =>
    submissionToReview({
      kind: row.s.kind,
      name: p.name ?? serverTranslator(locale)("email.toReview.unnamed"),
      place: [p.city, p.state].filter(Boolean).join(", "),
      submitter: row.submitter,
      url: `${getServerConfig().APP_URL}/admin`,
      locale,
    })
  // Each moderator on their own: one bad address mustn't stop the rest. The
  // job fails afterwards if any failed, so the retry sends just those.
  let sent = 0
  const failed: unknown[] = []
  for (const m of moderators) {
    if (m.id === row.s.submittedBy) continue
    try {
      if (await sendOnce(`submission-created:${submissionId}:${m.id}`, m.email, email(toLocale(m.locale)), db)) sent++
    } catch (err) {
      failed.push(err)
    }
  }
  if (failed.length) throw new AggregateError(failed, `${failed.length} of the moderator emails failed`)
  return { sent }
}

/**
 * Tells the submitter what a moderator decided, once per decision. The
 * job runs a few minutes after it; if the decision was undone or changed
 * since (`reviewedAt` no longer matches), it sends nothing.
 */
export async function notifySubmissionReviewed(submissionId: string, reviewedAt: string, db: Database = getDb()): Promise<{ sent: number }> {
  const row = await loadSubmission(submissionId, db)
  if (!row || row.s.status === "pending" || !row.s.reviewedAt || row.s.reviewedAt.toISOString() !== new Date(reviewedAt).toISOString()) return { sent: 0 }
  const p = row.s.payload as Payload
  // In the submitter's language, with links to the map in it (#185).
  const locale = toLocale(row.locale)
  const t = serverTranslator(locale)
  const name = p.name ?? t("email.approved.unnamed")
  const map = `${getServerConfig().APP_URL}${localizedPath("/map", locale)}`
  const email =
    row.s.status === "approved"
      ? submissionApproved({ name, kind: row.s.kind, url: `${map}?location=${row.s.locationId}`, locale })
      : submissionRejected({
          name,
          reason: row.s.rejectReason ? t(`map.submissions.rejectReasons.${row.s.rejectReason}`) : t("email.rejected.noReason"),
          url: `${map}?add=${row.s.kind}`,
          locale,
        })
  const sent = await sendOnce(`submission-reviewed:${submissionId}:${row.s.reviewedAt.toISOString()}`, row.email, email, db)
  return { sent: sent ? 1 : 0 }
}

export const submissionCreatedJob = defineJob({
  description: "Emails moderators about a new submission",
  schema: z.object({ submissionId: z.string().uuid() }),
  async run({ submissionId }) {
    return notifySubmissionCreated(submissionId)
  },
})

export const submissionReviewedJob = defineJob({
  description: "Emails a submitter what a moderator decided",
  schema: z.object({ submissionId: z.string().uuid(), reviewedAt: z.string().datetime({ offset: true }) }),
  async run({ submissionId, reviewedAt }) {
    return notifySubmissionReviewed(submissionId, reviewedAt)
  },
})
