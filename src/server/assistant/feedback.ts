import "server-only"
import { and, eq, gte, sql } from "drizzle-orm"
import { getDb, type Database } from "@/server/db/client"
import { assistantFeedback, assistantTurnTexts, assistantTurns, type FeedbackReason } from "@/server/db/schema"

/**
 * Thumbs up or down on assistant answers (#213). Votes never change the
 * prompt or the model on their own: someone reviews the thumbs-down turns,
 * and the ones worth keeping become eval cases (#208).
 */

export interface Feedback {
  turnId: string
  userId: string
  vote: 1 | -1
  reason?: FeedbackReason | null
  comment?: string | null
}

/** Saves (or changes) a vote on one of the user's own answered turns. A thumbs up drops any reason and comment. */
export async function saveFeedback(f: Feedback, db: Database = getDb()): Promise<"saved" | "not_found"> {
  const [turn] = await db
    .select({ id: assistantTurns.id })
    .from(assistantTurns)
    .where(and(eq(assistantTurns.id, f.turnId), eq(assistantTurns.userId, f.userId)))
  if (!turn) return "not_found"
  const down = f.vote === -1
  const values = { vote: f.vote, reason: down ? (f.reason ?? null) : null, comment: down ? f.comment?.trim() || null : null }
  await db
    .insert(assistantFeedback)
    .values({ turnId: f.turnId, userId: f.userId, ...values })
    .onConflictDoUpdate({ target: assistantFeedback.turnId, set: { ...values, updatedAt: sql`now()` } })
  return "saved"
}

export interface FeedbackStatsRow {
  day: string
  model: string | null
  promptVersion: string | null
  /** Turns that got an answer. */
  answered: number
  up: number
  down: number
}

/**
 * Votes per day, model and prompt version since `since`: the thumbs-up rate
 * is up / (up + down), and the vote rate (up + down) / answered. Few people
 * vote, so read them as trends.
 */
export async function feedbackStats(since: Date, db: Database = getDb()): Promise<FeedbackStatsRow[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(${assistantTurns.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      model: assistantTurns.model,
      promptVersion: assistantTurns.promptVersion,
      answered: sql<number>`count(*) filter (where ${assistantTurns.outcome} <> 'limited' and ${assistantTurns.outcome} <> 'paused')::int`,
      up: sql<number>`count(${assistantFeedback.turnId}) filter (where ${assistantFeedback.vote} = 1)::int`,
      down: sql<number>`count(${assistantFeedback.turnId}) filter (where ${assistantFeedback.vote} = -1)::int`,
    })
    .from(assistantTurns)
    .leftJoin(assistantFeedback, eq(assistantFeedback.turnId, assistantTurns.id))
    .where(gte(assistantTurns.createdAt, since))
    .groupBy(sql`1`, assistantTurns.model, assistantTurns.promptVersion)
    .orderBy(sql`1`, assistantTurns.model, assistantTurns.promptVersion)
  return rows
}

export interface DownvotedTurn {
  turnId: string
  at: string
  reason: FeedbackReason | null
  comment: string | null
  question: string | null
  answer: string | null
  tools: unknown
  model: string | null
  promptVersion: string | null
}

/** Thumbs-down turns since `since`, newest first, with their text while it's kept: the review list. */
export async function downvotedTurns(since: Date, db: Database = getDb(), limit = 50): Promise<DownvotedTurn[]> {
  const rows = await db
    .select({
      turnId: assistantTurns.id,
      at: assistantFeedback.updatedAt,
      reason: assistantFeedback.reason,
      comment: assistantFeedback.comment,
      question: assistantTurnTexts.question,
      answer: assistantTurnTexts.answer,
      tools: assistantTurns.tools,
      model: assistantTurns.model,
      promptVersion: assistantTurns.promptVersion,
    })
    .from(assistantFeedback)
    .innerJoin(assistantTurns, eq(assistantTurns.id, assistantFeedback.turnId))
    .leftJoin(assistantTurnTexts, eq(assistantTurnTexts.turnId, assistantTurns.id))
    .where(and(eq(assistantFeedback.vote, -1), gte(assistantFeedback.updatedAt, since)))
    .orderBy(sql`${assistantFeedback.updatedAt} desc`)
    .limit(limit)
  return rows.map((r) => ({ ...r, at: r.at.toISOString() }))
}
