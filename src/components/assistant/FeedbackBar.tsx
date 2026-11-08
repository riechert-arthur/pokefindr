"use client"

import { useRef, useState, type FormEvent } from "react"
import { ThumbsDownIcon, ThumbsUpIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

export const FEEDBACK_REASON_LABELS = {
  wrong_place: "Wrong place",
  outdated: "Outdated info",
  misunderstood: "Didn't understand",
  other: "Other",
} as const
type Reason = keyof typeof FEEDBACK_REASON_LABELS

type Vote = { vote: "up" | "down"; reason?: Reason | null; comment?: string | null }

async function post(turnId: string, body: Vote) {
  const res = await fetch("/api/assistant/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ turnId, ...body }) })
  if (!res.ok) throw new Error(`POST /api/assistant/feedback failed (${res.status})`)
}

const iconButton =
  "grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 aria-pressed:bg-muted aria-pressed:text-foreground"
const chip =
  "rounded-full border border-border bg-card px-[11px] py-1 text-caption text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-foreground aria-pressed:bg-muted"

/**
 * Thumbs up or down on one answer (#213). A thumbs down asks why, with an
 * optional comment. Voting again changes the vote. One request at a time:
 * the buttons wait while a vote is sending, so the last click is what's
 * saved, and a thumbs down sent again keeps the reason already given.
 */
export function FeedbackBar({ turnId }: { turnId: string }) {
  const [vote, setVote] = useState<"up" | "down" | null>(null)
  const [asking, setAsking] = useState(false)
  const [reason, setReason] = useState<Reason | null>(null)
  const [comment, setComment] = useState("")
  /** What the server has: the reason and comment are kept on later thumbs downs. */
  const saved = useRef<Vote | null>(null)
  const [sending, setSending] = useState(false)
  const [thanks, setThanks] = useState(false)
  const [failed, setFailed] = useState(false)

  const send = async (body: Vote): Promise<boolean> => {
    setSending(true)
    setFailed(false)
    try {
      await post(turnId, body)
      saved.current = body
      return true
    } catch (err) {
      console.error("[assistant] couldn't send feedback", err)
      setFailed(true)
      return false
    } finally {
      setSending(false)
    }
  }

  const choose = async (v: "up" | "down") => {
    const keep = v === "down" && saved.current?.vote === "down" ? saved.current : null
    setVote(v)
    setThanks(false)
    setAsking(v === "down" && !keep?.reason && !keep?.comment)
    const ok = await send(keep ?? { vote: v })
    if (ok && (v === "up" || keep)) setThanks(true)
  }

  const sendReason = async (e: FormEvent) => {
    e.preventDefault()
    if (await send({ vote: "down", reason, comment: comment.trim() || null })) {
      setAsking(false)
      setThanks(true)
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex items-center gap-1" role="group" aria-label="Rate this answer">
        <button type="button" className={iconButton} aria-label="Good answer" aria-pressed={vote === "up"} disabled={sending} onClick={() => choose("up")}>
          <ThumbsUpIcon className="size-3.5" aria-hidden />
        </button>
        <button type="button" className={iconButton} aria-label="Bad answer" aria-pressed={vote === "down"} disabled={sending} onClick={() => choose("down")}>
          <ThumbsDownIcon className="size-3.5" aria-hidden />
        </button>
        <span className="ml-1 text-caption" role="status">
          {failed ? <span className="text-destructive">Couldn&apos;t send that. Try again.</span> : thanks ? <span className="text-muted-foreground">Thanks for the feedback.</span> : null}
        </span>
      </div>
      {asking && (
        <form onSubmit={sendReason} className="grid gap-2 rounded-lg border border-border bg-card p-3">
          <p className="text-caption font-semibold text-foreground" id={`why-${turnId}`}>
            What was wrong? (optional)
          </p>
          <div role="group" aria-labelledby={`why-${turnId}`} className="flex flex-wrap gap-1.5">
            {(Object.keys(FEEDBACK_REASON_LABELS) as Reason[]).map((r) => (
              <button key={r} type="button" aria-pressed={reason === r} className={chip} onClick={() => setReason(reason === r ? null : r)}>
                {FEEDBACK_REASON_LABELS[r]}
              </button>
            ))}
          </div>
          <Textarea value={comment} onChange={(e) => setComment(e.target.value)} maxLength={500} rows={2} aria-label="Tell us more (optional)" placeholder="Tell us more (optional)" className="text-body" />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAsking(false)}>
              Skip
            </Button>
            <Button type="submit" size="sm" disabled={sending}>
              Send
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}
