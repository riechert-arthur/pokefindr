"use client"

import { useRef, useState, type FormEvent } from "react"
import { Link } from "@/i18n/navigation"
import { StarRating } from "@/components/pokefindr/StarRating"
import { UserAvatar } from "@/components/pokefindr/UserAvatar"
import type { LocationKind } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import type { Review, ReviewsState } from "./useLocationReviews"
import { useFormat } from "@/i18n/format"
import { useFormatter, useTranslations } from "next-intl"

/** The longest review text the API takes. */
export const REVIEW_MAX_LENGTH = 500

/** Under the title: the stars and "4.5 · 3 reviews", or "No reviews yet". */
export function ReviewSummary({ reviews }: { reviews: ReviewsState }) {
  const t = useTranslations("reviews")
  const format = useFormatter()
  if (reviews.status === "loading" && reviews.count === 0) return <Skeleton className="h-4 w-40" />
  if (reviews.status === "error") return null
  return (
    <div className="flex items-center gap-2 text-body text-muted-foreground">
      <StarRating rating={reviews.average} starSize={14} />
      <span>
        {reviews.count
          ? t("summary", { average: format.number(reviews.average, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: reviews.count })
          : t("none")}
      </span>
    </div>
  )
}

interface ReviewsSectionProps {
  kind: LocationKind
  reviews: ReviewsState
  /** The signed-in viewer's name; null signed out (the form becomes a log-in link). */
  username: string | null
  /** The location's name, for the delete confirmation. */
  placeName?: string
}

/**
 * The panel's Reviews, as in the prototype: each review with its stars and
 * age, then the form (stars and optional text). The viewer can edit or delete
 * their own; posting shows the review at once.
 */
export function ReviewsSection({ kind, reviews, username, placeName }: ReviewsSectionProps) {
  const f = useFormat()
  const t = useTranslations("reviews")
  // The review being edited in the form, or null for a new one.
  const [editing, setEditing] = useState<Review | null>(null)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)
  // The review waiting for the delete confirmation.
  const [deleting, setDeleting] = useState<Review | null>(null)
  const textRef = useRef<HTMLTextAreaElement>(null)
  // The Delete button that opened the confirmation: focus returns to it.
  const deleteButton = useRef<HTMLButtonElement | null>(null)

  const reset = () => {
    setEditing(null)
    setRating(0)
    setText("")
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!rating || !username) return
    setBusy(true)
    const input = { rating, text: text.trim() }
    const target = editing
    reset()
    const ok = target ? await reviews.edit(target.id, input) : await reviews.add(input, username)
    if (!ok) {
      // Put the draft back so nothing typed is lost.
      setEditing(target)
      setRating(input.rating)
      setText(input.text)
    }
    setBusy(false)
    // The submit button is disabled again, so keep focus in the form.
    textRef.current?.focus()
  }

  const startEdit = (r: Review) => {
    setEditing(r)
    setRating(r.rating)
    setText(r.text)
    // Move to the form so it's clear the review is open there.
    textRef.current?.focus()
  }

  const confirmDelete = () => {
    const r = deleting
    setDeleting(null)
    if (!r) return
    if (editing?.id === r.id) reset()
    void reviews.remove(r.id)
  }

  return (
    <section aria-labelledby="reviews-title" className="mt-5">
      <h3 id="reviews-title" className="mb-2 text-subheading text-foreground">
        {t("title")}
      </h3>
      {reviews.status === "error" ? (
        <p className="text-body text-muted-foreground">
          {t("failed")}{" "}
          <Button type="button" variant="link" className="h-auto p-0" onClick={reviews.reload}>
            {t("tryAgain")}
          </Button>
        </p>
      ) : reviews.status === "loading" && reviews.count === 0 ? (
        <div aria-label={t("loading")} className="grid gap-2.5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : reviews.count === 0 ? (
        <p className="text-body text-muted-foreground">
          {t("first", { kind })}
        </p>
      ) : (
        <ul className="mb-3 grid gap-2.5">
          {reviews.reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-border px-3 py-2.5 text-body">
              <div className="flex items-center gap-2">
                <UserAvatar size="xs" name={r.username} />
                <b className="font-semibold">{r.username}</b>
                <StarRating rating={r.rating} starSize={13} />
                <span className="grow" />
                <span className="text-caption text-muted-foreground">{f.ago(r.createdAt)}</span>
              </div>
              {r.text && <p className="mt-1.5 whitespace-pre-line break-words">{r.text}</p>}
              {r.mine && !r.id.startsWith("pending-") && (
                <div className="mt-1 flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-caption" onClick={() => startEdit(r)} disabled={busy}>
                    {t("edit")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-caption" onClick={(e) => {
                      deleteButton.current = e.currentTarget
                      setDeleting(r)
                    }}
                    disabled={busy}
                  >
                    {t("delete")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {username ? (
        <form onSubmit={submit} aria-label={editing ? t("editTitle") : t("writeTitle")} className="mt-2.5 grid gap-2 rounded-lg bg-muted p-3">
          <div className="flex items-center gap-2">
            <span className="text-body text-muted-foreground">{t("yourRating")}</span>
            <StarRating rating={rating} starSize={20} onChange={setRating} label={t("yourRating")} />
          </div>
          <Textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={REVIEW_MAX_LENGTH}
            aria-label={t("yourReview")}
            placeholder={t("placeholder")}
            className="bg-background"
          />
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">{rating ? "" : t("pickRating")}</span>
            <span className="grow" />
            {editing && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                {t("cancel")}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!rating || busy}>
              {editing ? t("save") : t("post")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-2.5 rounded-lg bg-muted p-3 text-body text-muted-foreground">
          {t.rich("login", {
            link: (chunks) => (
              <Link href="/login" className="text-primary underline underline-offset-4">
                {chunks}
              </Link>
            ),
          })}
        </p>
      )}
      <Dialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent
          onCloseAutoFocus={(e) => {
            // There's no DialogTrigger: back to the Delete button, or to the
            // form once the review is gone.
            e.preventDefault()
            const button = deleteButton.current
            deleteButton.current = null
            if (button?.isConnected) button.focus()
            else textRef.current?.focus()
          }}
        >
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {placeName ? t("deleteBody", { place: placeName }) : t("deleteBodyUnnamed")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("cancel")}
              </Button>
            </DialogClose>
            <Button type="button" variant="destructive" onClick={confirmDelete}>
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}
