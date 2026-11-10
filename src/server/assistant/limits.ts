import "server-only"
import { and, eq, sql } from "drizzle-orm"
import type { Database } from "@/server/db/client"
import { assistantPlaceViews, assistantUsage } from "@/server/db/schema"
import { tokenBucket } from "@/server/lib/rate-limit"
import type { AssistantUsage } from "@/lib/types/assistant-stream"
import type { ApiErrorCode } from "@/server/api-error"
import { log } from "@/server/log"

/**
 * The assistant's limits (#209) and its cap on places (#211). Daily counts
 * live in Postgres (assistant_usage, assistant_place_views), so every
 * server instance shares them. The per-minute bucket and the one-open-turn
 * rule are per instance until the shared limiter (#199) lands.
 */

export const MESSAGES_PER_MINUTE = 10
export const MESSAGES_PER_DAY = 100
/** Tokens a user may use a day: input (cached or not) plus output. */
export const TOKENS_PER_DAY = 1_000_000
/** Distinct places the assistant shows one user a day; past it, answers point to the map. */
export const PLACES_PER_DAY = 200

/** A UTC day as "YYYY-MM-DD": the limits reset at 00:00 UTC. */
export const utcDay = (now: Date) => now.toISOString().slice(0, 10)

/** Seconds until the next UTC midnight, for Retry-After. */
export const secondsToNextDay = (now: Date) => Math.max(1, Math.ceil((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1) - now.getTime()) / 1000))

const perMinute = tokenBucket({ perMinute: MESSAGES_PER_MINUTE, burst: MESSAGES_PER_MINUTE })
const openTurns = new Set<string>()

/** `code` and `values` name the page's message for it (apiErrors in messages/*.yml, #185). */
export type Refusal =
  | { kind: "paused"; message: string; code: ApiErrorCode }
  | {
      kind: "limited"
      message: string
      code: ApiErrorCode
      values?: Record<string, number>
      retryAfter: number
      /** Turned away by the in-memory checks (per minute, one open turn), before any database read: not worth a log row. */
      quick?: true
    }

/**
 * Whether `userId` may start a turn now. Checks, cheapest first: the
 * per-minute rate, one open turn, the daily messages and tokens, then the
 * global spend ceiling. On success the message is counted and the turn
 * marked open; call `endTurn` when it finishes.
 */
export async function startTurn(
  { userId, now, dailyBudgetMicros }: { userId: string; now: Date; dailyBudgetMicros: number },
  db: Database,
): Promise<{ ok: true; spentToday: number } | { ok: false; refusal: Refusal }> {
  if (!perMinute.take(userId)) return { ok: false, refusal: { kind: "limited", message: "You're sending messages quickly. Wait a minute and try again.", code: "tooFast", retryAfter: 60, quick: true } }
  if (openTurns.has(userId)) return { ok: false, refusal: { kind: "limited", message: "Wait for the current answer to finish.", code: "answerInProgress", retryAfter: 5, quick: true } }
  // Claimed before the first await, so requests sent at once can't all get past this.
  openTurns.add(userId)
  try {
    const day = utcDay(now)
    const [[mine], [all]] = await Promise.all([
      db.select().from(assistantUsage).where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.day, day))),
      db.select({ cost: sql<number>`coalesce(sum(${assistantUsage.costMicros}), 0)::bigint` }).from(assistantUsage).where(eq(assistantUsage.day, day)),
    ])
    const tomorrow = secondsToNextDay(now)
    const overMessages = { ok: false as const, refusal: { kind: "limited" as const, message: `You've reached today's limit of ${MESSAGES_PER_DAY} messages. It resets at midnight UTC.`, code: "dailyMessages" as const, values: { limit: MESSAGES_PER_DAY }, retryAfter: tomorrow } }
    if ((mine?.messages ?? 0) >= MESSAGES_PER_DAY) return release(userId, overMessages)
    if ((mine?.inputTokens ?? 0) + (mine?.outputTokens ?? 0) >= TOKENS_PER_DAY)
      return release(userId, { ok: false, refusal: { kind: "limited", message: "You've used today's assistant allowance. It resets at midnight UTC.", code: "dailyAllowance", retryAfter: tomorrow } })
    const spent = Number(all.cost)
    if (spent >= dailyBudgetMicros) return release(userId, { ok: false, refusal: { kind: "paused", message: "The assistant is paused for today. The map and search still work.", code: "assistantPaused" } })
    // Counted only while under the cap, in one statement, so other instances can't push past it either.
    const counted = await db
      .insert(assistantUsage)
      .values({ userId, day, messages: 1 })
      .onConflictDoUpdate({
        target: [assistantUsage.userId, assistantUsage.day],
        set: { messages: sql`${assistantUsage.messages} + 1` },
        setWhere: sql`${assistantUsage.messages} < ${MESSAGES_PER_DAY}`,
      })
      .returning({ messages: assistantUsage.messages })
    if (counted.length === 0) return release(userId, overMessages)
    return { ok: true, spentToday: spent }
  } catch (err) {
    openTurns.delete(userId)
    throw err
  }
}

function release<T>(userId: string, result: T): T {
  openTurns.delete(userId)
  return result
}

/** Records what a turn used and marks it finished. Safe to call once per started turn. */
export async function endTurn({ userId, now, usage }: { userId: string; now: Date; usage: AssistantUsage }, db: Database): Promise<void> {
  openTurns.delete(userId)
  const day = utcDay(now)
  await db
    .update(assistantUsage)
    .set({
      inputTokens: sql`${assistantUsage.inputTokens} + ${usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens}`,
      outputTokens: sql`${assistantUsage.outputTokens} + ${usage.outputTokens}`,
      costMicros: sql`${assistantUsage.costMicros} + ${usage.costMicros}`,
    })
    .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.day, day)))
}

const warned = new Map<string, number>()

/** Logs once per instance and day when the day's spend passes 50% and 80% of the ceiling. */
export function warnOnSpend(spentMicros: number, budgetMicros: number, now: Date) {
  const day = utcDay(now)
  const share = spentMicros / budgetMicros
  const level = share >= 0.8 ? 80 : share >= 0.5 ? 50 : 0
  if (level && (warned.get(day) ?? 0) < level) {
    warned.set(day, level)
    log.warn("assistant.spend_ceiling", { percent: level, spentUsd: Number((spentMicros / 1e6).toFixed(2)), budgetUsd: Number((budgetMicros / 1e6).toFixed(2)) })
  }
}

/** The places a user may still be shown today: the ones already shown are free, new ones count down. */
export interface PlaceBudget {
  left: number
  seen: Set<string>
  /** Shown during this turn, to record. */
  added: string[]
}

export async function loadPlaceBudget(userId: string, now: Date, db: Database): Promise<PlaceBudget> {
  const rows = await db
    .select({ id: assistantPlaceViews.locationId })
    .from(assistantPlaceViews)
    .where(and(eq(assistantPlaceViews.userId, userId), eq(assistantPlaceViews.day, utcDay(now))))
  return { left: Math.max(0, PLACES_PER_DAY - rows.length), seen: new Set(rows.map((r) => r.id)), added: [] }
}

export async function savePlaceViews(userId: string, now: Date, budget: PlaceBudget, db: Database): Promise<void> {
  if (budget.added.length === 0) return
  const day = utcDay(now)
  await db
    .insert(assistantPlaceViews)
    .values(budget.added.map((locationId) => ({ userId, day, locationId })))
    .onConflictDoNothing()
}

/** Test helper: forget the in-memory buckets and open turns. */
export function resetLimitsForTests() {
  openTurns.clear()
  warned.clear()
  // A fresh bucket per test run: the module-level one can't be reset.
  Object.assign(perMinute, tokenBucket({ perMinute: MESSAGES_PER_MINUTE, burst: MESSAGES_PER_MINUTE }))
}
