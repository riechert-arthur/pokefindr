"use client"

import { useState, type FormEvent } from "react"
import Link from "next/link"
import { StarRating } from "@/components/pokefindr/StarRating"
import { KINDS, type LocationKind } from "@/components/pokefindr/kinds"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { timeAgo } from "@/lib/format/time"
import type { Review, ReviewsState } from "./useLocationReviews"

/** The longest review text the API takes. */
export const REVIEW_MAX_LENGTH = 500

/** Under the title: the stars and "4.5 · 3 reviews", or "No reviews yet". */
export function ReviewSummary({ reviews }: { reviews: ReviewsState }) {
  if (reviews.status === "loading" && reviews.count === 0) return <Skeleton className="h-4 w-40" />
  if (reviews.status === "error") return null
  return (
    <div className="flex items-center gap-2 text-body text-muted-foreground">
      <StarRating rating={reviews.average} starSize={14} />
      <span>{reviews.count ? `${reviews.average.toFixed(1)} · ${reviews.count} review${reviews.count === 1 ? "" : "s"}` : "No reviews yet"}</span>
    </div>
  )
}

interface ReviewsSectionProps {
  kind: LocationKind
  reviews: ReviewsState
  /** The signed-in viewer's name; null signed out (the form becomes a log-in link). */
  username: string | null
}

/**
 * The panel's Reviews, as in the prototype: each review with its stars and
 * age, then the form (stars and optional text). The viewer can edit or delete
 * their own; posting shows the review at once.
 */
export function ReviewsSection({ kind, reviews, username }: ReviewsSectionProps) {
  // The review being edited in the form, or null for a new one.
  const [editing, setEditing] = useState<Review | null>(null)
  const [rating, setRating] = useState(0)
  const [text, setText] = useState("")
  const [busy, setBusy] = useState(false)

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
  }

  const startEdit = (r: Review) => {
    setEditing(r)
    setRating(r.rating)
    setText(r.text)
  }

  return (
    <section aria-labelledby="reviews-title" className="mt-5">
      <h3 id="reviews-title" className="mb-2 text-subheading text-foreground">
        Reviews
      </h3>
      {reviews.status === "error" ? (
        <p className="text-body text-muted-foreground">
          Couldn&apos;t load reviews.{" "}
          <Button type="button" variant="link" className="h-auto p-0" onClick={reviews.reload}>
            Try again
          </Button>
        </p>
      ) : reviews.status === "loading" && reviews.count === 0 ? (
        <div aria-label="Loading reviews" className="grid gap-2.5">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : reviews.count === 0 ? (
        <p className="text-body text-muted-foreground">
          Be the first to review this {KINDS[kind].one}. Was it stocked? Was it easy to find?
        </p>
      ) : (
        <ul className="mb-3 grid gap-2.5">
          {reviews.reviews.map((r) => (
            <li key={r.id} className="rounded-lg border border-border px-3 py-2.5 text-body">
              <div className="flex items-center gap-2">
                <span aria-hidden className="grid size-[22px] place-items-center rounded-full bg-muted text-overline font-bold tracking-normal">
                  {r.username.charAt(0).toUpperCase()}
                </span>
                <b className="font-semibold">{r.username}</b>
                <StarRating rating={r.rating} starSize={13} />
                <span className="grow" />
                <span className="text-caption text-muted-foreground">{timeAgo(r.createdAt)}</span>
              </div>
              {r.text && <p className="mt-1.5 whitespace-pre-line break-words">{r.text}</p>}
              {r.mine && !r.id.startsWith("pending-") && (
                <div className="mt-1 flex gap-1">
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-caption" onClick={() => startEdit(r)} disabled={busy}>
                    Edit
                  </Button>
                  <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-caption" onClick={() => void reviews.remove(r.id)} disabled={busy}>
                    Delete
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {username ? (
        <form onSubmit={submit} aria-label={editing ? "Edit your review" : "Write a review"} className="mt-2.5 grid gap-2 rounded-lg bg-muted p-3">
          <div className="flex items-center gap-2">
            <span className="text-body text-muted-foreground">Your rating</span>
            <StarRating rating={rating} starSize={20} onChange={setRating} label="Your rating" />
          </div>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={REVIEW_MAX_LENGTH}
            aria-label="Your review"
            placeholder="What did you find? Stock, restock day, where the machine is in the store…"
            className="bg-background"
          />
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted-foreground">{rating ? "" : "Pick a rating to post."}</span>
            <span className="grow" />
            {editing && (
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!rating || busy}>
              {editing ? "Save changes" : "Post review"}
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-2.5 rounded-lg bg-muted p-3 text-body text-muted-foreground">
          <Link href="/login" className="text-primary underline underline-offset-4">
            Log in
          </Link>{" "}
          to write a review.
        </p>
      )}
    </section>
  )
}
