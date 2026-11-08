"use client"

import { useState, type FormEvent } from "react"
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { cn } from "@/lib/utils"

export const FEEDBACK_REASON_LABELS = {
  wrong_place: "Wrong place",
  outdated: "Outdated info",
  misunderstood: "Didn't understand",
  other: "Other",
} as const
type Reason = keyof typeof FEEDBACK_REASON_LABELS

async function post(body: { turnId: string; vote: "up" | "down"; reason?: Reason | null; comment?: string | null }) {
  const res = await fetch("/api/assistant/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
  if (!res.ok) throw new Error(`POST /api/assistant/feedback failed (${res.status})`)
}

const iconButton =
  "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:text-foreground"
const chip =
  "rounded-full border border-border bg-card px-[11px] py-1 text-caption text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:border-foreground aria-checked:bg-muted"

/**
 * Thumbs up or down on one answer (#213). A thumbs down asks why, with an
 * optional comment. Voting again changes the vote.
 */
export function FeedbackBar({ turnId }: { turnId: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [comment, setComment] = useState("")
  const [thanks, setThanks] = useState(false)
  const [failed, setFailed] = useState(false)

  const choose = async (v: "up" | "down") => {
    setVote(v)
    setAsking(v === "down")
    setThanks(v === "up")
    setFailed(false)
    try {
      await post({ turnId, vote: v })
    } catch (err) {
      console.error("[assistant] couldn't send feedback", err)
      setFailed(true)
    }
  }

  const sendReason = async (e: FormEvent) => {
    e.preventDefault()
    setFailed(false)
    try {
      await post({ turnId, vote: "down", reason, comment: comment.trim() || null })
      setAsking(false)
      setThanks(true)
    } catch (err) {
      console.error("[assistant] couldn't send feedback", err)
      setFailed(true)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Rate this answer">
        <button type="button" className={iconButton} aria-label="Good answer" aria-pressed={vote === "up"} onClick={() => choose("up")}>
          <ThumbsUpIcon className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={iconButton} aria-label="Bad answer" aria-pressed={vote === "down"} onClick={() => choose("down")}>
          <ThumbsDownIcon className="size-3.5" aria-hidden />
        </button>
        {thanks && !failed && <span className="ml-1 text-caption text-muted-foreground" role="status">Thanks for the feedback.</span>}
        {failed && <span className="ml-1 text-caption text-destructive" role="status">Couldn&apos;t send that. Try again.</span>}
      </div>
      {asking && (
        <form onSubmit={sendReason} className="grid gap-2 rounded-lg border border-border bg-card p-3">
          <p className="text-caption font-semibold text-foreground" id={`why-${turnId}`}>
            What was wrong? (optional)
          </p>
          <div role="radiogroup" aria-labelledby={`why-${turnId}`} className="flex flex-wrap gap-1.5">
            {(Object.keys(FEEDBACK_REASON_LABELS) as Reason[]).map((r) => (
              <button key={r} type="button" role="radio" aria-checked={reason === r} className={cn(chip)} onClick={() => setReason(reason === r ? null : r)}>
                {FEEDBACK_REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} aria-label="Tell us more (optional)" placeholder="Tell us more (optional)" className="text-body" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Skip
            </Button>
            <Button type="submit" size="sm">
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
