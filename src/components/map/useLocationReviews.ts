"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"

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

async function send(url: string, method: string, body?: unknown): Promise<Response> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined })
  if (!res.ok) throw new Error(`${method} ${url} failed (${res.status})`)
  return res
}

/**
 * A location's reviews (GET /api/locations/<id>/reviews), with optimistic
 * add, edit and delete through /api/reviews: the list changes at once and
 * rolls back if the server says no.
 */
export function useLocationReviews(locationId: string): ReviewsState {
  const [status, setStatus] = useState<ReviewsState["status"]>("loading")
  const [reviews, setReviews] = useState<Review[]>([])
  // The list as last rendered, to roll back from (a state updater may not have run yet).
  const current = useRef(reviews)
  current.current = reviews
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
        setReviews(body.reviews)
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
        setReviews((rs) => rs.map((r) => (r.id === temp.id ? { ...r, id } : r)))
        return true
      } catch (err) {
        console.error("[map] couldn't post the review", err)
        setReviews((rs) => rs.filter((r) => r.id !== temp.id))
        toast.error("Couldn't post your review", { description: "Check your connection and try again." })
        return false
      }
    },
    [locationId],
  )

  const edit = useCallback(async (id: string, input: { rating: number; text: string }) => {
    const before = current.current.find((r) => r.id === id)
    setReviews((rs) => rs.map((r) => (r.id === id ? { ...r, ...input } : r)))
    try {
      await send(`/api/reviews/${encodeURIComponent(id)}`, "PATCH", input)
      return true
    } catch (err) {
      console.error("[map] couldn't save the review", err)
      if (before) setReviews((rs) => rs.map((r) => (r.id === id ? before : r)))
      toast.error("Couldn't save your changes", { description: "Check your connection and try again." })
      return false
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    const index = current.current.findIndex((r) => r.id === id)
    const removed = current.current[index]
    setReviews((rs) => rs.filter((r) => r.id !== id))
    try {
      await send(`/api/reviews/${encodeURIComponent(id)}`, "DELETE")
      return true
    } catch (err) {
      console.error("[map] couldn't delete the review", err)
      if (removed) setReviews((rs) => [...rs.slice(0, index), removed, ...rs.slice(index)])
      toast.error("Couldn't delete your review", { description: "Check your connection and try again." })
      return false
    }
  }, [])

  const count = reviews.length
  const average = count ? reviews.reduce((n, r) => n + r.rating, 0) / count : 0
  return { status, reviews, count, average, reload, add, edit, remove }
}
