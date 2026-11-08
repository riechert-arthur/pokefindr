import "server-only"
import { eq, inArray, lt, sql } from "drizzle-orm"
import { z } from "zod"
import { getDb, type Database } from "@/server/db/client"
import { assistantPlaceViews, assistantTurnTexts, assistantTurns, assistantUsage, type AssistantOutcome } from "@/server/db/schema"
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

/** Why a turn might need a look: a refusal, injection-looking input, a hit cap, or an unusual cost. */
export function flagsFor({ question, outcome, tools, costMicros }: { question: string; outcome: AssistantOutcome; tools: readonly ToolCall[]; costMicros: number }): string[] {
  const flags: string[] = []
  if (outcome === "refused") flags.push("refused")
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
  usage: AssistantUsage
  latencyMs: number | null
  tools: ToolCall[]
  flags: string[]
  /** Stored separately and deleted after TEXT_DAYS; null to store none (a refused request). */
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
      inputTokens: t.usage.inputTokens,
      outputTokens: t.usage.outputTokens,
      cacheReadTokens: t.usage.cacheReadTokens,
      cacheWriteTokens: t.usage.cacheWriteTokens,
      costMicros: t.usage.costMicros,
      latencyMs: t.latencyMs,
      tools: t.tools,
      flags: t.flags,
    })
    if (t.text) await tx.insert(assistantTurnTexts).values({ turnId: t.id, question: t.text.question, answer: t.text.answer })
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

/** Deletes the text of a user's turns ("clear my assistant history"); the rows stay, without text. */
export async function deleteHistory(userId: string, db: Database = getDb()): Promise<number> {
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
  const turns = await db.delete(assistantTurns).where(lt(assistantTurns.createdAt, daysAgo(now, TURN_DAYS))).returning({ id: assistantTurns.id })
  // Daily usage stays 90 days for cost history; place views only matter today.
  const usage = await db.delete(assistantUsage).where(lt(assistantUsage.day, sql`${daysAgo(now, 90).toISOString().slice(0, 10)}::date`)).returning({ day: assistantUsage.day })
  const views = await db.delete(assistantPlaceViews).where(lt(assistantPlaceViews.day, sql`${daysAgo(now, 2).toISOString().slice(0, 10)}::date`)).returning({ day: assistantPlaceViews.day })
  return { texts: texts.length, turns: turns.length, usageDays: usage.length, placeViews: views.length }
}

/** Runs daily (vercel.json). Safe to repeat. */
export const assistantRetentionJob = defineJob({
  description: "Deletes assistant message text after 30 days and old usage rows",
  schema: z.unknown(),
  async run() {
    return purgeAssistantData()
  },
})
