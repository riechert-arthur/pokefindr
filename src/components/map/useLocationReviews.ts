"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

export interface Review {
  id: string
  rating: number
  text: string
  username: string
  createdAt: string
  mine: boolean
}

export interface ReviewsState {
  status: "loading" | "ready" | "error"
  reviews: Review[]
  count: number
  /** 0 without reviews. */
  average: number
  reload: () => void
  /** Shows the review at once, then saves it; on failure it's taken back with a toast. */
  add: (input: { rating: number; text: string }, username: string) => Promise<boolean>
  edit: (id: string, input: { rating: number; text: string }) => Promise<boolean>
  remove: (id: string) => Promise<boolean>
}

/** The session ran out: the toast asks the viewer to log in again. */
export class SignedOutError extends Error {}

async function send(url: string, method: string, body?: unknown): Promise<Response> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (res.status === 401) throw new SignedOutError(`${method} ${url}: signed out`)
  if (!res.ok) throw new Error(`${method} ${url} failed (${res.status})`)
  return res
}

type ReviewMessages = ReturnType<typeof useTranslations<"reviews">>

/** "Check your connection", or "Log in again" when the session ran out. */
function failed(t: ReviewMessages, title: "postFailed" | "editFailed" | "deleteFailed", err: unknown) {
  if (err instanceof SignedOutError) {
    toast.error(t(title), { description: t("sessionEnded") })
  } else {
    console.error(`[map] ${title}`, err)
    toast.error(t(title), { description: t("connection") })
  }
}

/**
 * A location's reviews (GET /api/locations/<id>/reviews), with optimistic
 * add, edit and delete through /api/reviews: the list changes at once and
 * rolls back if the server says no.
 */
export function useLocationReviews(locationId: string): ReviewsState {
  const t = useTranslations("reviews")
  const [status, setStatus] = useState<ReviewsState["status"]>("loading")
  const [reviews, setReviews] = useState<Review[]>([])
  // The list as last rendered, to roll back from (a state updater may not have run yet).
  const current = useRef(reviews)
  current.current = reviews
  // Reviews this hook posted: a list read before one was saved mustn't drop it.
  const saved = useRef(new Set<string>())
  const [attempt, setAttempt] = useState(0)
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()
    setStatus("loading")
    fetch(`/api/locations/${encodeURIComponent(locationId)}/reviews`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`GET reviews failed (${res.status})`)
        const body = (await res.json()) as { reviews: Review[] }
        if (controller.signal.aborted) return
        // Keep reviews being posted, or posted after this list was read.
        const listed = new Set(body.reviews.map((r) => r.id))
        const ours = (r: Review) => r.id.startsWith("pending-") || (saved.current.has(r.id) && !listed.has(r.id))
        setReviews((rs) => [...rs.filter(ours), ...body.reviews])
        setStatus("ready")
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        console.error("[map] couldn't load reviews", err)
        setStatus("error")
      })
    return () => controller.abort()
  }, [locationId, attempt])

  const add = useCallback(
    async (input: { rating: number; text: string }, username: string) => {
      const temp: Review = { id: `pending-${Date.now()}`, ...input, username, createdAt: new Date().toISOString(), mine: true }
      setReviews((rs) => [temp, ...rs])
      try {
        const res = await send("/api/reviews", "POST", { locationId, ...input })
        const { id } = (await res.json()) as { id: string }
        saved.current.add(id)
        // A reload during the post may already list it under its id.
        setReviews((rs) => rs.filter((r) => r.id !== id).map((r) => (r.id === temp.id ? { ...r, id } : r)))
        toast.success(t("posted"), { description: t("postedBody") })
        return true
      } catch (err) {
        setReviews((rs) => rs.filter((r) => r.id !== temp.id))
        failed(t, "postFailed", err)
        return false
      }
    },
    [locationId, t],
  )

  const edit = useCallback(async (id: string, input: { rating: number; text: string }) => {
    const before = current.current.find((r) => r.id === id)
    setReviews((rs) => rs.map((r) => (r.id === id ? { ...r, ...input } : r)))
    try {
      await send(`/api/reviews/${encodeURIComponent(id)}`, "PATCH", input)
      return true
    } catch (err) {
      if (before) setReviews((rs) => rs.map((r) => (r.id === id ? before : r)))
      failed(t, "editFailed", err)
      return false
    }
  }, [t])

  const remove = useCallback(async (id: string) => {
    const index = current.current.findIndex((r) => r.id === id)
    const removed = current.current[index]
    setReviews((rs) => rs.filter((r) => r.id !== id))
    try {
      await send(`/api/reviews/${encodeURIComponent(id)}`, "DELETE")
      saved.current.delete(id)
      return true
    } catch (err) {
      if (removed) setReviews((rs) => [...rs.slice(0, index), removed, ...rs.slice(index)])
      failed(t, "deleteFailed", err)
      return false
    }
  }, [t])

  const count = reviews.length
  const average = count ? reviews.reduce((n, r) => n + r.rating, 0) / count : 0
  return { status, reviews, count, average, reload, add, edit, remove }
}
