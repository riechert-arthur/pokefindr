/**
 * Turns a reviewed thumbs-down turn into an eval case skeleton for
 * cases.yaml (#213 → #208). The expectations are left for the reviewer to
 * write: a vote says something went wrong, not what right looks like.
 */
import { stringify } from "yaml"

export interface DownvotedForExport {
  turnId: string
  question: string | null
  answer: string | null
  reason: string | null
  comment: string | null
  tools: unknown
}

export function caseFromFeedback(t: DownvotedForExport): string {
  if (!t.question) throw new Error(`Turn ${t.turnId} has no text any more (kept 30 days).`)
  const doc = {
    id: `feedback-${t.turnId.slice(0, 8)}`,
    category: "feedback",
    question: t.question,
    expect: { tools: [], mentions: [], notMentions: [] },
  }
  const notes = [
    `From thumbs-down turn ${t.turnId}: ${t.reason ?? "no reason"}${t.comment ? `, "${t.comment}"` : ""}.`,
    `It answered: ${(t.answer ?? "").replace(/\s+/g, " ").slice(0, 300)}`,
    `Tools: ${JSON.stringify(t.tools)}`,
    "Fill in expect (what a right answer does) before adding this to cases.yaml.",
  ]
  return `${notes.map((n) => `# ${n}`).join("\n")}\n${stringify([doc]).trimEnd()}\n`
}
