/**
 * The assistant's feedback, for review until the admin view (R8):
 *
 *   npm run assistant:feedback              last 7 days
 *   npm run assistant:feedback -- --days 30
 *
 * Prints the thumbs-up and vote rates per day, model and prompt version,
 * then the thumbs-down answers with their question, answer (while the text
 * is kept, 30 days), reason and comment. A thumbs-down worth keeping becomes
 * an eval case only after someone has read it (#208). Loads .env files like
 * `next dev`.
 */
import { loadDevEnv } from "../db/env"

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "–")

async function main() {
  loadDevEnv()
  const i = process.argv.indexOf("--days")
  const days = i > 0 ? Number(process.argv[i + 1]) : 7
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days takes a positive number")
  const since = new Date(Date.now() - days * 86_400_000)
  const { feedbackStats, downvotedTurns } = await import("@/server/assistant/feedback")

  const stats = await feedbackStats(since)
  console.log(`Feedback since ${since.toISOString().slice(0, 10)}\n`)
  console.table(
    stats.map((r) => ({ day: r.day, model: r.model, prompt: r.promptVersion, answered: r.answered, up: r.up, down: r.down, "thumbs-up rate": pct(r.up, r.up + r.down), "vote rate": pct(r.up + r.down, r.answered) })),
  )

  const down = await downvotedTurns(since)
  console.log(`\n${down.length} thumbs-down answer${down.length === 1 ? "" : "s"}${down.length ? ":" : "."}`)
  for (const t of down) {
    console.log(`\n— ${t.at}  turn ${t.turnId}  (${t.model ?? "?"}, prompt ${t.promptVersion ?? "?"})`)
    console.log(`  reason:   ${t.reason ?? "none"}${t.comment ? `; "${t.comment}"` : ""}`)
    console.log(`  question: ${t.question ?? "(text deleted)"}`)
    console.log(`  answer:   ${t.answer ? t.answer.replace(/\n+/g, " ").slice(0, 400) : "(text deleted)"}`)
    console.log(`  tools:    ${JSON.stringify(t.tools)}`)
  }
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  })
  .finally(async () => {
    const { closeDb } = await import("@/server/db/client")
    await closeDb()
  })
