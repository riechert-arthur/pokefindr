import "server-only"
import { eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { getDb, type Database } from "@/server/db/client"
import { locationSubmissions, profiles, sentNotifications, users } from "@/server/db/schema"
import { getMailer } from "@/server/container"
import { getServerConfig } from "@/server/config"
import { submissionApproved, submissionRejected, submissionToReview, type EmailContent } from "@/server/email/templates"
import { defineJob } from "@/server/lib/jobs/types"
import { REJECT_REASON_LABELS } from "@/lib/submissions/constants"

/** How long after a decision the submitter hears about it, so an undo (within the hour) usually comes first. */
export const REVIEWED_EMAIL_DELAY_SECONDS = 10 * 60

/**
 * Sends one email at most once for `key`: claims the key, sends, and gives
 * the key back if the send fails, so the job's retry sends it. Returns
 * whether it sent now.
 */
async function sendOnce(key: string, to: string, email: EmailContent, db: Database): Promise<boolean> {
  const claimed = await db.insert(sentNotifications).values({ key }).onConflictDoNothing().returning({ key: sentNotifications.key })
  if (!claimed.length) return false
  try {
    await getMailer().send({ to, ...email })
    return true
  } catch (err) {
    await db.delete(sentNotifications).where(eq(sentNotifications.key, key))
    throw err
  }
}

async function loadSubmission(id: string, db: Database) {
  const [row] = await db
    .select({ s: locationSubmissions, submitter: profiles.username, email: users.email })
    .from(locationSubmissions)
    .innerJoin(profiles, eq(profiles.id, locationSubmissions.submittedBy))
    .innerJoin(users, eq(users.id, locationSubmissions.submittedBy))
    .where(eq(locationSubmissions.id, id))
  return row
}

type Payload = { name?: string; city?: string; state?: string }

/**
 * Tells every moderator and admin about a new submission, once each. Skips
 * one that's no longer pending (someone already decided it).
 */
export async function notifySubmissionCreated(submissionId: string, db: Database = getDb()): Promise<{ sent: number }> {
  const row = await loadSubmission(submissionId, db)
  if (!row || row.s.status !== "pending") return { sent: 0 }
  const p = row.s.payload as Payload
  const moderators = await db
    .select({ id: users.id, email: users.email })
    .from(profiles)
    .innerJoin(users, eq(users.id, profiles.id))
    .where(inArray(profiles.role, ["moderator", "admin"]))
  const email = submissionToReview({
    kind: row.s.kind,
    name: p.name ?? "A new place",
    place: [p.city, p.state].filter(Boolean).join(", "),
    submitter: row.submitter,
    url: `${getServerConfig().APP_URL}/admin/review`,
  })
  let sent = 0
  for (const m of moderators) {
    if (m.id === row.s.submittedBy) continue
    if (await sendOnce(`submission-created:${submissionId}:${m.id}`, m.email, email, db)) sent++
  }
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
  const name = p.name ?? "Your place"
  const app = getServerConfig().APP_URL
  const email =
    row.s.status === "approved"
      ? submissionApproved({ name, kind: row.s.kind, url: `${app}/map?location=${row.s.locationId}` })
      : submissionRejected({ name, reason: row.s.rejectReason ? REJECT_REASON_LABELS[row.s.rejectReason] : "it didn't pass review", url: `${app}/map?add=${row.s.kind}` })
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
