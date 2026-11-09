"use client"

import { useState, type FormEvent } from "react"
import { Link } from "@/i18n/navigation"
import { toast } from "sonner"
import { KINDS, type LocationKind } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Textarea } from "@/components/ui/textarea"
import { REPORT_REASONS, REPORT_REASON_LABELS, type ReportReason } from "@/lib/locations/reports"

interface ReportFormProps {
  locationId: string
  kind: LocationKind
  signedIn: boolean
  /** Closes the form (Cancel, or after sending). */
  onClose: () => void
}

/**
 * "Report a problem", as in the prototype: what's wrong with this place
 * (gone, wrong pin, empty, something else), sent to
 * /api/locations/<id>/reports. Signed out, it asks to log in.
 */
export function ReportForm({ locationId, kind, signedIn, onClose }: ReportFormProps) {
  const [reason, setReason] = useState<ReportReason | "">("")
  const [comment, setComment] = useState("")
  const [sending, setSending] = useState(false)
  const one = KINDS[kind].one

  if (!signedIn)
    return (
      <div className="mt-2.5 rounded-lg border border-border bg-muted px-3 py-2.5 text-body text-muted-foreground">
        <Link href="/login" className="text-primary underline underline-offset-4">
          Log in
        </Link>{" "}
        to report a problem with this {one}.
      </div>
    )

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!reason) return
    setSending(true)
    try {
      const res = await fetch(`/api/locations/${encodeURIComponent(locationId)}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, ...(reason === "other" && comment.trim() ? { comment: comment.trim() } : {}) }),
      })
      if (res.status === 401) {
        toast.error("Couldn't send your report", { description: "Your session ended. Log in again and retry." })
        return
      }
      if (res.status === 429) {
        toast.error("Too many reports today", { description: "Thanks for helping. Try again tomorrow." })
        return
      }
      if (!res.ok) throw new Error(`POST reports failed (${res.status})`)
      const { duplicate } = (await res.json()) as { duplicate?: boolean }
      if (duplicate) toast("Already reported", { description: `You reported this ${one} today. Thanks.` })
      else toast.success("Report sent", { description: `Thanks. We'll check "${REPORT_REASON_LABELS[reason].toLowerCase()}" for this ${one}.` })
      onClose()
    } catch (err) {
      console.error("[map] couldn't send the report", err)
      toast.error("Couldn't send your report", { description: "Check your connection and try again." })
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} aria-label="Report a problem" className="mt-2.5 grid gap-1 rounded-lg border border-border bg-muted px-3 py-2.5">
      <p id="report-question" className="mb-1 text-body text-muted-foreground">
        What&apos;s wrong with this {one}?
      </p>
      <RadioGroup value={reason} onValueChange={(v) => setReason(v as ReportReason)} aria-labelledby="report-question" className="gap-0">
        {REPORT_REASONS.map((r) => (
          <div key={r} className="flex items-center gap-2 py-1">
            <RadioGroupItem value={r} id={`report-${r}`} className="border-foreground text-foreground" />
            <Label htmlFor={`report-${r}`} className="cursor-pointer text-body font-normal">
              {REPORT_REASON_LABELS[r]}
            </Label>
          </div>
        ))}
      </RadioGroup>
      {reason === "other" && (
        <Textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          maxLength={500}
          aria-label="What's wrong? (optional)"
          placeholder="What's wrong? (optional)"
          className="mt-1 bg-background"
        />
      )}
      <div className="mt-1 flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={!reason || sending}>
          Send report
        </Button>
      </div>
    </form>
  )
}
