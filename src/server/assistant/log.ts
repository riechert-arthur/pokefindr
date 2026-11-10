import "server-only"
import { and, eq, inArray, isNotNull, lt, sql } from "drizzle-orm"
import { z } from "zod/v3"
import { getDb, type Database } from "@/server/db/client"
import { assistantFeedback, assistantPlaceViews, assistantTurnTexts, assistantTurns, assistantUsage, type AssistantOutcome } from "@/server/db/schema"
import { defineJob } from "@/server/lib/jobs/types"
import type { AssistantUsage } from "@/lib/types/assistant-stream"

/**
 * The assistant's turn log (#212): one row per turn for cost and review,
 * plus its text, kept 30 days. Logged lines carry no message text.
 */

/** How long question and answer text is kept. */
export const TEXT_DAYS = 30
/** How long turn rows (no text) are kept, for cost and abuse trends. */
export const TURN_DAYS = 365
/** A turn costing more than this (in millionths of a dollar) is flagged. */
export const COST_OUTLIER_MICROS = 250_000

export interface ToolCall {
  name: string
  input: unknown
  ok: boolean
  /** The error the model got back, for a failed call. */
  error?: string
}

/** Phrases that try to talk the model out of its instructions. */
const INJECTION = /\b(ignore|disregard|forget)\b.{0,40}\b(instructions|rules|prompt)\b|\bsystem prompt\b|\byou are now\b|\bjailbreak\b|\bdeveloper mode\b/i

/** The turn-log flags a check adds: `moderated` when it held or blocked the question, `moderation_error` when it didn't run. */
export function moderationFlags(check: { verdict: "allow" | "hold" | "block"; failed?: boolean } | null | undefined): string[] {
  if (!check) return []
  if (check.failed) return ["moderation_error"]
  return check.verdict === "allow" ? [] : ["moderated"]
}

/**
 * Why a turn might need a look: a refusal, injection-looking input, a hit
 * cap, an unusual cost, or the input check (#253): `moderated` when it held
 * or blocked the question, `moderation_error` when it didn't run.
 */
export function flagsFor({
  question,
  outcome,
  tools,
  costMicros,
  moderation,
}: {
  question: string
  outcome: AssistantOutcome
  tools: readonly ToolCall[]
  costMicros: number
  moderation?: { verdict: "allow" | "hold" | "block"; failed?: boolean } | null
}): string[] {
  const flags: string[] = []
  if (outcome === "refused") flags.push("refused")
  flags.push(...moderationFlags(moderation))
  if (INJECTION.test(question)) flags.push("injection")
  if (outcome === "limited") flags.push("rate_limited")
  if (tools.some((t) => !t.ok && /limit of places/i.test(t.error ?? ""))) flags.push("place_cap")
  if (costMicros > COST_OUTLIER_MICROS) flags.push("cost_outlier")
  return flags
}

export interface TurnRecord {
  id: string
  userId: string
  outcome: AssistantOutcome
  model: string | null
  /** PROMPT_VERSION, for turns that ran. */
  promptVersion?: string | null
  usage: AssistantUsage
  latencyMs: number | null
  tools: ToolCall[]
  flags: string[]
  /** Stored separately (with the tools' inputs and errors) and deleted after TEXT_DAYS; null to store none (a refused request). */
  text: { question: string; answer: string } | null
}

/** Stores a turn, and writes one log line about it (no text). */
export async function recordTurn(t: TurnRecord, db: Database = getDb()): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(assistantTurns).values({
      id: t.id,
      userId: t.userId,
      outcome: t.outcome,
      model: t.model,
      promptVersion: t.promptVersion ?? null,
      inputTokens: t.usage.inputTokens,
      outputTokens: t.usage.outputTokens,
      cacheReadTokens: t.usage.cacheReadTokens,
      cacheWriteTokens: t.usage.cacheWriteTokens,
      costMicros: t.usage.costMicros,
      latencyMs: t.latencyMs,
      // Names only: inputs and errors are what someone typed, kept with the text below.
      tools: t.tools.map(({ name, ok }) => ({ name, ok })),
      flags: t.flags,
    })
    if (t.text) await tx.insert(assistantTurnTexts).values({ turnId: t.id, question: t.text.question, answer: t.text.answer, toolCalls: t.tools })
  })
  console.info(
    JSON.stringify({
      event: "assistant_turn",
      turnId: t.id,
      userId: t.userId,
      outcome: t.outcome,
      model: t.model,
      ...t.usage,
      latencyMs: t.latencyMs,
      tools: t.tools.map((x) => `${x.name}${x.ok ? "" : "!"}`),
      flags: t.flags,
    }),
  )
}

/** Deletes the text of a user's turns and feedback comments ("clear my assistant history"); the rows stay, without text. */
export async function deleteHistory(userId: string, db: Database = getDb()): Promise<number> {
  await db.update(assistantFeedback).set({ comment: null }).where(eq(assistantFeedback.userId, userId))
  const deleted = await db
    .delete(assistantTurnTexts)
    .where(inArray(assistantTurnTexts.turnId, db.select({ id: assistantTurns.id }).from(assistantTurns).where(eq(assistantTurns.userId, userId))))
    .returning({ id: assistantTurnTexts.turnId })
  return deleted.length
}

const daysAgo = (now: Date, days: number) => new Date(now.getTime() - days * 86_400_000)

/** Deletes text past TEXT_DAYS, turns past TURN_DAYS, and usage rows no limit reads any more. */
export async function purgeAssistantData(now = new Date(), db: Database = getDb()) {
  // Text first: deleting a turn deletes its text too, which would hide it from the count.
  const texts = await db.delete(assistantTurnTexts).where(lt(assistantTurnTexts.createdAt, daysAgo(now, TEXT_DAYS))).returning({ id: assistantTurnTexts.turnId })
  // Feedback comments are someone's words too: same 30 days.
  const comments = await db
    .update(assistantFeedback)
    .set({ comment: null })
    .where(and(lt(assistantFeedback.createdAt, daysAgo(now, TEXT_DAYS)), isNotNull(assistantFeedback.comment)))
    .returning({ id: assistantFeedback.turnId })
  const turns = await db.delete(assistantTurns).where(lt(assistantTurns.createdAt, daysAgo(now, TURN_DAYS))).returning({ id: assistantTurns.id })
  // Daily usage stays 90 days for cost history; place views only matter today.
  const usage = await db.delete(assistantUsage).where(lt(assistantUsage.day, sql`${daysAgo(now, 90).toISOString().slice(0, 10)}::date`)).returning({ day: assistantUsage.day })
  const views = await db.delete(assistantPlaceViews).where(lt(assistantPlaceViews.day, sql`${daysAgo(now, 2).toISOString().slice(0, 10)}::date`)).returning({ day: assistantPlaceViews.day })
  return { texts: texts.length, feedbackComments: comments.length, turns: turns.length, usageDays: usage.length, placeViews: views.length }
}

/** Runs daily (vercel.json). Safe to repeat. */
export const assistantRetentionJob = defineJob({
  description: "Deletes assistant message text after 30 days and old usage rows",
  schema: z.unknown(),
  async run() {
    return purgeAssistantData()
  },
})
