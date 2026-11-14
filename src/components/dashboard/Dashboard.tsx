"use client"

import { useCallback, useEffect, useState, type ReactNode } from "react"
import { AgentMark } from "@/components/brand/AgentMark"
import { shareViewer, type Viewer } from "@/lib/assistant/hand-off"
import { DEFAULT_RADIUS } from "@/lib/map/url-state"
import { LOCATE_GIVE_UP_MS } from "@/lib/map/locate"
import type { MyReview } from "@/lib/reviews/my-review"
import type { MySubmission } from "@/lib/submissions/schemas"
import type { Highlights, UpcomingEvent } from "@/lib/types/highlights"
import type { RegionCount } from "@/lib/types/locations"
import { cn } from "@/lib/utils"
import { DASHBOARD_COLUMN } from "./column"
import { DashboardFrame } from "./DashboardFrame"
import { EventsTile, NearYouTile, ReviewsTile, SubmissionsTile, type NearState, type TileData } from "./DashboardTiles"
import { useFormat } from "@/i18n/format"
import { useTranslations } from "next-intl"

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`)
  return (await res.json()) as T
}

/** Coordinates to ~1 km: all the dashboard and the assistant need. */
const round2 = (n: number) => Math.round(n * 100) / 100

interface DashboardProps {
  /**
   * The way into the assistant (#391): the composer, which opens /chat to ask.
   * It gets the viewer's location once shared, and renders the suggestions.
   */
  assistant: (props: { viewer: Viewer | null }) => ReactNode
}

/**
 * The signed-in home (/home), from the prototype: a centered greeting and
 * the assistant's composer, suggestions, then tiles for what's near, your
 * reviews, your submissions and upcoming events. The conversation itself
 * happens on /chat (#391), so this page always keeps the account's tiles.
 */
export function Dashboard({ assistant }: DashboardProps) {
  const f = useFormat()
  const t = useTranslations("dashboard")
  const [vending, setVending] = useState<number | null>(null)
  const [reviews, setReviews] = useState<TileData<MyReview>>(null)
  const [submissions, setSubmissions] = useState<TileData<MySubmission>>(null)
  const [events, setEvents] = useState<TileData<UpcomingEvent>>(null)
  const [near, setNear] = useState<NearState>({ status: "idle" })
  const [viewer, setViewer] = useState<Viewer | null>(null)

  useEffect(() => {
    const ctl = new AbortController()
    /** Fetches one tile's data. If that fails while the dashboard is still open, logs it and calls `onError`. */
    function load<R>(url: string, onLoad: (res: R) => void, onError?: () => void) {
      getJson<R>(url, ctl.signal)
        .then(onLoad)
        .catch((err) => {
          if (ctl.signal.aborted) return
          console.error("[home] couldn't load a tile", err)
          onError?.()
        })
    }
    // No count, no error: the intro just leaves the number out.
    load<{ counts: RegionCount[] }>("/api/locations/aggregates", ({ counts }) => setVending(counts.filter((c) => c.country === "US" && c.kind === "vending").reduce((n, c) => n + c.count, 0)))
    load<{ reviews: MyReview[] }>("/api/my-reviews", (r) => setReviews(r.reviews), () => setReviews("error"))
    load<{ submissions: MySubmission[] }>("/api/submissions?mine", (r) => setSubmissions(r.submissions), () => setSubmissions("error"))
    load<Highlights>("/api/highlights", (h) => setEvents(h.events), () => setEvents("error"))
    return () => ctl.abort()
  }, [])

  const locate = useCallback(() => {
    if (!navigator.geolocation) return setNear({ status: "denied" })
    setNear({ status: "locating" })
    // Firefox calls neither callback when the prompt is dismissed, and the timeout below
    // only starts once permission is given, so give up on our own (as the map does).
    let settled = false
    const giveUp = setTimeout(() => {
      if (!settled) setNear({ status: "denied" })
      settled = true
    }, LOCATE_GIVE_UP_MS)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        if (settled) return
        settled = true
        clearTimeout(giveUp)
        const at = { lng: round2(pos.coords.longitude), lat: round2(pos.coords.latitude) }
        setViewer(at)
        shareViewer(at)
        try {
          const { counts } = await getJson<{ counts: number[] }>(`/api/locations/counts?points=${at.lng},${at.lat}&r=${DEFAULT_RADIUS}`, new AbortController().signal)
          setNear({ status: "ready", count: counts[0] ?? 0 })
        } catch {
          setNear({ status: "ready", count: null })
        }
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(giveUp)
        setNear({ status: "denied" })
      },
      { timeout: 15_000, maximumAge: 300_000 },
    )
  }, [])

  return (
    <DashboardFrame>
      <main className={cn(DASHBOARD_COLUMN, "flex min-h-0 flex-1 flex-col justify-start gap-[18px] overflow-y-auto pb-7 pt-4 md:justify-center md:pt-2")}>
        <div className="grid justify-items-center gap-2.5 text-center">
          <AgentMark size="lg" />
          <h1 className="mt-1.5 text-balance text-title text-foreground">{t("greeting")}</h1>
          <p className="max-w-[52ch] text-subheading font-normal text-muted-foreground">
            {vending === null ? t("introNoCount") : t("intro", { count: f.count(vending) })}
          </p>
        </div>

        {assistant({ viewer })}

        <div className="mt-2 grid grid-cols-1 gap-2.5 min-[480px]:grid-cols-2 min-[861px]:grid-cols-4">
          <NearYouTile near={near} onLocate={locate} />
          <ReviewsTile reviews={reviews} />
          <SubmissionsTile submissions={submissions} />
          <EventsTile events={events} />
        </div>
      </main>
    </DashboardFrame>
  )
}
